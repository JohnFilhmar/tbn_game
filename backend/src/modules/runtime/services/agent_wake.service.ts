import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { OPEN_TASK_STATUSES, type ProcessType } from '@tbn/contracts';
import { PROCESS_TYPE } from '@/config/config.tokens';
import { QueueService } from '@/lib/queue/queue.service';
import type { AgentWakeJob } from '@/lib/queue/queues';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord, TaskRecord } from '@/modules/company/types/company_records';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from '@/modules/runtime/repositories/interface/transcript_repository.interface';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { RunLoopService } from '@/modules/runtime/services/run_loop/run_loop.service';
import { SubtaskDeliveryService } from '@/modules/runtime/services/run_loop/subtask_delivery.service';
import { WorkerSweepService } from '@/modules/runtime/services/worker_sweep.service';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/**
 * Handles `agent_wake` jobs on the worker. A wake first hands the agent the results of its
 * finished subtasks, then drives its running run, resumes its paused run when the pause is over,
 * or starts a run for its next queued task or an unread message. Wakes are safe to repeat.
 */
@Injectable()
export class AgentWakeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgentWakeService.name);

  constructor(
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    private readonly queue: QueueService,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly providers: ProviderService,
    private readonly loop: RunLoopService,
    private readonly deliveries: SubtaskDeliveryService,
    private readonly sweep: WorkerSweepService,
  ) {}

  /**
   * On the worker, registers the wake handler and starts the sweep. Not awaited: the queue may
   * still be waiting for the migration release step, and the health listener must come up
   * meanwhile.
   */
  onApplicationBootstrap(): void {
    if (this.process_type !== 'worker') return;
    this.begin().catch((error: unknown) => {
      if (this.queue.stopping) return;
      this.logger.error(
        `Worker cannot handle wakes: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });
  }

  /** One wake. */
  async handle(job: AgentWakeJob): Promise<void> {
    let agent: AgentRecord;
    try {
      agent = await this.agents.require(job.owner_id, job.agent_id);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) return;
      throw error;
    }
    await this.deliveries.deliver(agent);
    await this.cancel_stale_runs(agent);
    if (agent.active_run_id !== null) {
      const run = await this.runs.find(agent.owner_id, agent.active_run_id);
      if (run?.status === 'running') {
        await this.loop.execute(agent.owner_id, run.id);
        return;
      }
      if (run?.status === 'paused') {
        await this.handle_paused(agent, run);
        return;
      }
      await this.agents.release_run(agent.owner_id, agent.id, agent.active_run_id);
    }
    if (!is_live(agent.status)) return;
    const task = await this.tasks.next_queued_for_agent(agent.owner_id, agent.id);
    if (task !== null) {
      await this.start_run(agent, task);
      return;
    }
    if (await this.transcripts.has_unread(agent.owner_id, agent.id)) {
      await this.start_run(agent, null);
    }
  }

  private async begin(): Promise<void> {
    await this.queue.work_agent_wake((job) => this.handle(job));
    this.sweep.start();
  }

  /**
   * A paused run ends when its task was cancelled or its agent left. Otherwise it resumes when
   * its pause is over: a message or result arrived, its `resume_at` passed, or its key has credit
   * again. Only the owner resumes a run the runaway guard paused.
   */
  private async handle_paused(agent: AgentRecord, run: RunRecord): Promise<void> {
    const task =
      run.task_id === null ? null : await this.tasks.require(agent.owner_id, run.task_id);
    const task_open = task !== null && OPEN_TASK_STATUSES.includes(task.status);
    if (!is_live(agent.status) || (task !== null && !task_open)) {
      if (task !== null && task_open) await this.cancel_task(task);
      await this.runs.finish(
        agent.owner_id,
        run.id,
        'cancelled',
        task !== null && !task_open ? `Task is ${task.status}` : `Agent was ${agent.status}`,
      );
      await this.agents.release_run(agent.owner_id, agent.id, run.id);
      await this.queue.send_agent_wake({ owner_id: agent.owner_id, agent_id: agent.id });
      return;
    }
    if (await this.pause_is_over(agent, run)) {
      await this.loop.resume(agent.owner_id, run.id, run.pause_reason !== 'waiting_on_subtasks');
    }
  }

  private async pause_is_over(agent: AgentRecord, run: RunRecord): Promise<boolean> {
    switch (run.pause_reason) {
      case 'waiting_on_subtasks':
        return this.transcripts.has_unread(agent.owner_id, agent.id);
      case 'cap_limit':
      case 'breaker_open':
        return run.resume_at === null || run.resume_at <= new Date();
      case 'out_of_credit': {
        const provider = await this.providers.require(agent.owner_id, agent.provider_id);
        return provider.out_of_credit_since === null;
      }
      case 'runaway_guard':
      case null:
        return false;
    }
  }

  private async start_run(agent: AgentRecord, task: TaskRecord | null): Promise<void> {
    const run = await this.runs.create(agent.owner_id, agent.id, task?.id ?? null);
    if (!(await this.agents.claim_run(agent.owner_id, agent.id, run.id))) {
      await this.runs.finish(agent.owner_id, run.id, 'cancelled', 'Agent was busy');
      return;
    }
    if (task !== null) {
      const started = await this.tasks.start(agent.owner_id, task.id);
      if (started === null) {
        await this.runs.finish(
          agent.owner_id,
          run.id,
          'cancelled',
          'Task was cancelled before it started',
        );
        await this.agents.release_run(agent.owner_id, agent.id, run.id);
        await this.queue.send_agent_wake({ owner_id: agent.owner_id, agent_id: agent.id });
        return;
      }
      await this.transcripts.append(agent.owner_id, agent.id, run.id, {
        kind: 'task_assignment',
        content: { task_id: task.id, title: task.title, instructions: task.instructions },
      });
    }
    await this.loop.execute(agent.owner_id, run.id);
  }

  private async cancel_task(task: TaskRecord): Promise<void> {
    try {
      await this.tasks.cancel(task.owner_id, task.id);
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  /** A run that was created but never became the agent's active run cannot be driven. */
  private async cancel_stale_runs(agent: AgentRecord): Promise<void> {
    for (const status of ['running', 'paused'] as const) {
      const runs = await this.runs.list(agent.owner_id, { agent_id: agent.id, status });
      for (const run of runs) {
        if (run.id === agent.active_run_id) continue;
        await this.runs.finish(agent.owner_id, run.id, 'cancelled', 'Run never became active');
      }
    }
  }
}
