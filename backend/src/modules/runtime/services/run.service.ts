import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Run, RunListQuery } from '@tbn/contracts';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import type { RunRecord } from '@/modules/runtime/types/run_record';
import { ApprovalService } from '@/modules/runtime/services/approvals/approval.service';

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
    tainted_at: record.tainted_at?.toISOString() ?? null,
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
    private readonly approvals: ApprovalService,
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
    await this.approvals.continue_run(run);
    return this.get(owner_id, id);
  }

  /**
   * Ends a paused run and cancels its task, which cancels the task's open subtasks too.
   *
   * @throws ConflictException when the run is not paused.
   */
  async stop(owner_id: string, id: string): Promise<Run> {
    const run = await this.require(owner_id, id);
    await this.approvals.stop_run(run);
    return this.get(owner_id, id);
  }

  private async require(owner_id: string, id: string): Promise<RunRecord> {
    const record = await this.runs.find(owner_id, id);
    if (record === null) throw new NotFoundException('Run not found');
    return record;
  }
}
