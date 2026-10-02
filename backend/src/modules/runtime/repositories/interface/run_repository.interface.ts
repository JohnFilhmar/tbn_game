import type { RunListQuery, RunPauseReason, RunStatus } from '@tbn/contracts';
import type { RunRecord } from '@/modules/runtime/types/run_record';

/** Injection token for `RunRepository`. */
export const RUN_REPOSITORY = Symbol('RUN_REPOSITORY');

/** Turn counters of a run after a model turn. */
export interface TurnCounts {
  turn_count: number;
  guard_turns: number;
}

/** Run rows, scoped by owner except for the worker's sweeps. */
export interface RunRepository {
  list(owner_id: string, query: RunListQuery): Promise<RunRecord[]>;
  find(owner_id: string, id: string): Promise<RunRecord | null>;
  create(owner_id: string, agent_id: string, task_id: string | null): Promise<RunRecord>;
  /**
   * Takes the lease when the run is running and nobody holds a live lease, this worker included:
   * two wakes for one agent handled at once in one process must not both drive its run. Returns
   * the run when taken, null otherwise.
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
  /** Counts one model turn, towards the run's total and towards the runaway guard. */
  increment_turn(owner_id: string, id: string): Promise<TurnCounts>;
  /**
   * Pauses a running run this worker holds and drops its lease in the same update. Returns
   * false when the run was not running under this lease.
   */
  pause(
    owner_id: string,
    id: string,
    lease_owner: string,
    reason: RunPauseReason,
    resume_at: Date | null,
  ): Promise<boolean>;
  /**
   * Resumes a paused run and takes its lease in one update, resetting the runaway guard when
   * asked. Returns the run when this worker resumed it, null when it was not paused.
   */
  resume(
    owner_id: string,
    id: string,
    lease_owner: string,
    until: Date,
    reset_guard: boolean,
  ): Promise<RunRecord | null>;
  /** The owner said go on after the runaway guard: running again, with no lease and no count. */
  continue_after_guard(owner_id: string, id: string): Promise<RunRecord | null>;
  /** Ends a running or paused run. */
  finish(
    owner_id: string,
    id: string,
    status: Exclude<RunStatus, 'running' | 'paused'>,
    error: string | null,
  ): Promise<RunRecord | null>;
  /** The runs of the given tasks. */
  ids_for_tasks(owner_id: string, task_ids: string[]): Promise<string[]>;
  /** Records when the run first read outside content. A later call changes nothing. */
  mark_tainted(owner_id: string, id: string, at: Date): Promise<void>;
  /**
   * Running runs whose lease has expired or was never taken, across every owner. The worker
   * re-sends a wake for each, which is how a run outlives the process that was running it.
   */
  find_orphaned(now: Date): Promise<RunRecord[]>;
  /**
   * Paused runs of every owner for one of `reasons`, and when `due_before` is given, only those
   * whose `resume_at` has passed it.
   */
  find_paused(reasons: RunPauseReason[], due_before: Date | null): Promise<RunRecord[]>;
  /** How many runs of every owner are in each status, for the operations dashboards. */
  count_by_status(): Promise<Array<{ status: RunStatus; count: number }>>;
}
