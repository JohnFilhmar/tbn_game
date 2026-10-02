import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Run, RunListQuery } from '@tbn/contracts';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/** Maps a run row to the API shape. Lease fields stay internal. */
export function to_run_view(record: RunRecord): Run {
  return {
    id: record.id,
    agent_id: record.agent_id,
    task_id: record.task_id,
    status: record.status,
    turn_count: record.turn_count,
    error: record.error,
    started_at: record.started_at.toISOString(),
    finished_at: record.finished_at?.toISOString() ?? null,
    updated_at: record.updated_at.toISOString(),
  };
}

/** Runs as the owner reads them. */
@Injectable()
export class RunService {
  constructor(@Inject(RUN_REPOSITORY) private readonly runs: RunRepository) {}

  async list(owner_id: string, query: RunListQuery): Promise<Run[]> {
    return (await this.runs.list(owner_id, query)).map(to_run_view);
  }

  async get(owner_id: string, id: string): Promise<Run> {
    const record = await this.runs.find(owner_id, id);
    if (record === null) throw new NotFoundException('Run not found');
    return to_run_view(record);
  }
}
