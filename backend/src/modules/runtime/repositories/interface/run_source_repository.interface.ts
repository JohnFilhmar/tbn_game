import type { RunSourceRecord, RunSourceWrite } from '@/modules/runtime/types/run_source_record';

/** Injection token for `RunSourceRepository`. */
export const RUN_SOURCE_REPOSITORY = Symbol('RUN_SOURCE_REPOSITORY');

/** Run source rows, scoped by owner. */
export interface RunSourceRepository {
  record(owner_id: string, write: RunSourceWrite): Promise<RunSourceRecord>;
  /** The sources of a run, oldest first. */
  list(owner_id: string, run_id: string): Promise<RunSourceRecord[]>;
}
