import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Run, RunListQuery } from '@tbn/contracts';
import { QueueService } from '@/lib/queue/queue.service';
import { AgentService } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/** Maps a run row to the API shape. Lease fields and the guard count stay internal. */
export function to_run_view(record: RunRecord): Run {
  return {
    id: record.id,
    agent_id: record.agent_id,
    task_id: record.task_id,
    status: record.status,
    pause_reason: record.pause_reason,
    resume_at: record.resume_at?.toISOString() ?? null,
    turn_count: record.turn_count,
    error: record.error,
    started_at: record.started_at.toISOString(),
    finished_at: record.finished_at?.toISOString() ?? null,
    updated_at: record.updated_at.toISOString(),
  };
}

/** Runs as the owner reads them, and the owner's answer to the runaway guard. */
@Injectable()
export class RunService {
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    private readonly tasks: TaskService,
    private readonly agents: AgentService,
    private readonly queue: QueueService,
  ) {}

  async list(owner_id: string, query: RunListQuery): Promise<Run[]> {
    return (await this.runs.list(owner_id, query)).map(to_run_view);
  }

  async get(owner_id: string, id: string): Promise<Run> {
    return to_run_view(await this.require(owner_id, id));
  }

  /**
   * Lets a run the runaway guard paused go on, with its turn count reset.
   *
   * @throws ConflictException when the run is not waiting for the owner.
   */
  async continue(owner_id: string, id: string): Promise<Run> {
    const run = await this.require(owner_id, id);
    if (run.status !== 'paused' || run.pause_reason !== 'runaway_guard') {
      throw new ConflictException('Run is not waiting for the owner');
    }
    if (run.task_id !== null) await this.tasks.approve(owner_id, run.task_id);
    const resumed = await this.runs.continue_after_guard(owner_id, id);
    if (resumed === null) throw new ConflictException('Run is not waiting for the owner');
    await this.queue.send_agent_wake({ owner_id, agent_id: run.agent_id });
    return to_run_view(resumed);
  }

  /**
   * Ends a paused run and cancels its task, which cancels the task's open subtasks too.
   *
   * @throws ConflictException when the run is not paused.
   */
  async stop(owner_id: string, id: string): Promise<Run> {
    const run = await this.require(owner_id, id);
    if (run.status !== 'paused') throw new ConflictException('Only a paused run can be stopped');
    const stopped = await this.runs.finish(owner_id, id, 'cancelled', 'Stopped by the owner');
    if (stopped === null) throw new ConflictException('Only a paused run can be stopped');
    if (run.task_id !== null) {
      try {
        await this.tasks.cancel(owner_id, run.task_id);
      } catch (error: unknown) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    await this.agents.release_run(owner_id, run.agent_id, run.id);
    await this.queue.send_agent_wake({ owner_id, agent_id: run.agent_id });
    return to_run_view(stopped);
  }

  private async require(owner_id: string, id: string): Promise<RunRecord> {
    const record = await this.runs.find(owner_id, id);
    if (record === null) throw new NotFoundException('Run not found');
    return record;
  }
}
