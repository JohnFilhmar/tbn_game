import { Inject, Injectable } from '@nestjs/common';
import type { RunSource, RunSourceKind } from '@tbn/contracts';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  RUN_SOURCE_REPOSITORY,
  type RunSourceRepository,
} from '@/modules/runtime/repositories/interface/run_source_repository.interface';
import type { RunSourceRecord } from '@/modules/runtime/types/run_source_record';

/** Maps a run source row to the API shape. */
export function to_run_source_view(record: RunSourceRecord): RunSource {
  return {
    id: record.id,
    run_id: record.run_id,
    kind: record.kind,
    reference: record.reference,
    cached: record.cached,
    read_at: record.read_at.toISOString(),
  };
}

/**
 * What a run read from outside: every page, search, library hit and plugin result is a source,
 * and the first one taints the run. Cached content taints exactly as fresh content does: it is
 * the same text from the same outside author.
 */
@Injectable()
export class RunSourceService {
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(RUN_SOURCE_REPOSITORY) private readonly sources: RunSourceRepository,
  ) {}

  /** Records the source and taints the run. */
  async record(
    owner_id: string,
    run_id: string,
    kind: RunSourceKind,
    reference: string,
    cached: boolean,
  ): Promise<void> {
    await this.sources.record(owner_id, { run_id, kind, reference, cached });
    await this.runs.mark_tainted(owner_id, run_id, new Date());
  }

  /** The sources of a run, oldest first. */
  async list(owner_id: string, run_id: string): Promise<RunSource[]> {
    return (await this.sources.list(owner_id, run_id)).map(to_run_source_view);
  }
}
