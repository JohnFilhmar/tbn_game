import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/**
 * What the owner's decisions do to a paused run: let it go on after the runaway guard, wake it
 * once its approvals are decided, or stop it and cancel its task.
 */
@Injectable()
export class RunControlService {
  private readonly logger = new Logger(RunControlService.name);

  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly tasks: TaskService,
    private readonly agents: AgentService,
    private readonly queue: QueueService,
  ) {}

  /**
   * The owner said go on after the runaway guard: the run is running again with its guard reset,
   * its task is back in progress, and a wake drives it.
   *
   * @throws ConflictException when the run is not paused by the guard.
   */
  async continue_after_guard(run: RunRecord): Promise<RunRecord> {
    if (run.status !== 'paused' || run.pause_reason !== 'runaway_guard') {
      throw new ConflictException('Run is not waiting for the owner');
    }
    if (run.task_id !== null) await this.tasks.approve(run.owner_id, run.task_id);
    const resumed = await this.runs.continue_after_guard(run.owner_id, run.id);
    if (resumed === null) throw new ConflictException('Run is not waiting for the owner');
    await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    return resumed;
  }

  /** Every approval of the run is decided: its task is back in progress and a wake resumes it. */
  async wake_after_approvals(run: RunRecord): Promise<void> {
    if (run.task_id !== null) await this.tasks.approve(run.owner_id, run.task_id);
    await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    this.logger.log(`Run ${run.id} has its approvals decided, waking ${run.agent_id}`);
  }

  /**
   * Ends a paused run and cancels its task, which cancels the task's open subtasks too.
   *
   * @throws ConflictException when the run is not paused.
   */
  async stop(run: RunRecord): Promise<RunRecord> {
    if (run.status !== 'paused') throw new ConflictException('Only a paused run can be stopped');
    const stopped = await this.runs.finish(
      run.owner_id,
      run.id,
      'cancelled',
      'Stopped by the owner',
    );
    if (stopped === null) throw new ConflictException('Only a paused run can be stopped');
    if (run.task_id !== null) {
      try {
        await this.tasks.cancel(run.owner_id, run.task_id);
      } catch (error: unknown) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    await this.agents.release_run(run.owner_id, run.agent_id, run.id);
    await this.queue.send_agent_wake({ owner_id: run.owner_id, agent_id: run.agent_id });
    return stopped;
  }
}
