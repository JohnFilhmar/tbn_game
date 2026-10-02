import type { RunListQuery, RunStatus } from '@tbn/contracts';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/** Injection token for `RunRepository`. */
export const RUN_REPOSITORY = Symbol('RUN_REPOSITORY');

/** Run rows, scoped by owner except for the worker's orphan scan. */
export interface RunRepository {
  list(owner_id: string, query: RunListQuery): Promise<RunRecord[]>;
  find(owner_id: string, id: string): Promise<RunRecord | null>;
  create(owner_id: string, agent_id: string, task_id: string | null): Promise<RunRecord>;
  /**
   * Takes the lease when the run is running and nobody else holds a live lease. Returns the run
   * when taken, null otherwise.
   */
  acquire_lease(
    owner_id: string,
    id: string,
    lease_owner: string,
    until: Date,
  ): Promise<RunRecord | null>;
  /** Extends a lease this worker holds. False when the lease was lost. */
  extend_lease(owner_id: string, id: string, lease_owner: string, until: Date): Promise<boolean>;
  release_lease(owner_id: string, id: string, lease_owner: string): Promise<void>;
  increment_turn(owner_id: string, id: string): Promise<number>;
  finish(
    owner_id: string,
    id: string,
    status: Exclude<RunStatus, 'running'>,
    error: string | null,
  ): Promise<void>;
  /**
   * Running runs whose lease has expired or was never taken, across every owner. The worker
   * re-sends a wake for each, which is how a run outlives the process that was running it.
   */
  find_orphaned(now: Date): Promise<RunRecord[]>;
}
