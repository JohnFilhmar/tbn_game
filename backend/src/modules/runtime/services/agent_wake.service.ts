import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { QueueService } from '@/lib/queue/queue.service';
import type { AgentWakeJob } from '@/lib/queue/queues';
import { AgentService } from '@/modules/company/services/agent.service';
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
import { RunLoopService } from './run_loop.service';

/**
 * Handles `agent_wake` jobs on the worker: resumes the agent's running run, or starts one for its
 * next queued task or an unanswered owner message. On boot and on a timer it re-sends a wake for
 * every run whose lease expired, which is how a run survives the death of its worker.
 */
@Injectable()
export class AgentWakeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgentWakeService.name);
  private recovery_timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(TRANSCRIPT_REPOSITORY) private readonly transcripts: TranscriptRepository,
    private readonly queue: QueueService,
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly loop: RunLoopService,
  ) {}

  /**
   * On the worker, registers the wake handler and starts orphan recovery. Not awaited: the queue
   * may still be waiting for the migration release step, and the health listener must come up
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

  onApplicationShutdown(): void {
    if (this.recovery_timer !== undefined) clearInterval(this.recovery_timer);
  }

  /** One wake: resume, start the next task, or answer the owner. Safe to call repeatedly. */
  async handle(job: AgentWakeJob): Promise<void> {
    let agent: AgentRecord;
    try {
      agent = await this.agents.require(job.owner_id, job.agent_id);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) return;
      throw error;
    }
    await this.cancel_stale_runs(agent);
    if (agent.active_run_id !== null) {
      const run = await this.runs.find(agent.owner_id, agent.active_run_id);
      if (run !== null && run.status === 'running') {
        await this.loop.execute(agent.owner_id, run.id);
        return;
      }
      await this.agents.release_run(agent.owner_id, agent.id, agent.active_run_id);
    }
    if (agent.status === 'dismissed') return;
    const task = await this.tasks.next_queued_for_agent(agent.owner_id, agent.id);
    if (task !== null) {
      await this.start_run(agent, task);
      return;
    }
    if (await this.transcripts.has_unanswered_owner_message(agent.owner_id, agent.id)) {
      await this.start_run(agent, null);
    }
  }

  /** Re-sends a wake for every running run without a live lease. */
  async recover_orphans(): Promise<void> {
    for (const run of await this.runs.find_orphaned(new Date())) {
      this.logger.warn(`Run ${run.id} has no live lease, waking agent ${run.agent_id}`);
      await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    }
  }

  private async begin(): Promise<void> {
    await this.queue.work_agent_wake((job) => this.handle(job));
    const interval_ms = Math.max(1_000, (this.config.worker.run_lease_seconds * 1_000) / 2);
    this.recovery_timer = setInterval(() => void this.recover_orphans_safely(), interval_ms);
    this.recovery_timer.unref();
    await this.recover_orphans_safely();
  }

  private async recover_orphans_safely(): Promise<void> {
    try {
      await this.recover_orphans();
    } catch (error: unknown) {
      this.logger.error(
        `Orphan recovery failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
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

  /** A run that was created but never became the agent's active run cannot be driven. */
  private async cancel_stale_runs(agent: AgentRecord): Promise<void> {
    const running = await this.runs.list(agent.owner_id, { agent_id: agent.id, status: 'running' });
    for (const run of running) {
      if (run.id === agent.active_run_id) continue;
      await this.runs.finish(agent.owner_id, run.id, 'cancelled', 'Run never became active');
    }
  }
}
