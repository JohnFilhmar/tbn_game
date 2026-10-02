import type { TaskListQuery, TaskStatus } from '@tbn/contracts';
import type { TaskRecord, TaskWrite } from '@/modules/company/types/company_records';

/** Injection token for `TaskRepository`. */
export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/** Fields a status change may set alongside the status. */
export interface TaskStatusPatch {
  status_reason?: string | null;
  result?: string | null;
  started_at?: Date;
  finished_at?: Date;
}

/** Task rows, scoped by owner except for the worker's sweep. */
export interface TaskRepository {
  list(owner_id: string, query: TaskListQuery): Promise<TaskRecord[]>;
  find(owner_id: string, id: string): Promise<TaskRecord | null>;
  create(owner_id: string, data: TaskWrite): Promise<TaskRecord>;
  /**
   * Moves a task from one of `from` to `status`. Returns null when the task is missing or not in
   * one of the `from` statuses, so two workers cannot both start or finish it.
   */
  transition(
    owner_id: string,
    id: string,
    from: readonly TaskStatus[],
    status: TaskStatus,
    patch?: TaskStatusPatch,
  ): Promise<TaskRecord | null>;
  /** The oldest queued task of an agent. */
  next_queued_for_agent(owner_id: string, agent_id: string): Promise<TaskRecord | null>;
  /** Cancels every queued task of an agent. Returns how many it cancelled. */
  cancel_queued_for_agent(owner_id: string, agent_id: string): Promise<number>;
  /** The direct children of the given tasks, oldest first. */
  list_children(owner_id: string, parent_ids: string[]): Promise<TaskRecord[]>;
  /** Tasks an agent delegated that have finished and whose result it has not been given. */
  finished_unnotified(owner_id: string, delegator_agent_id: string): Promise<TaskRecord[]>;
  /** Records that the delegator was given the result. False when it already was. */
  mark_delegator_notified(owner_id: string, id: string): Promise<boolean>;
  /**
   * Moves every queued and in-progress task of the given agents to `blocked` with `reason`.
   * Returns how many it moved.
   */
  block_open_for_agents(owner_id: string, agent_ids: string[], reason: string): Promise<number>;
  /** Blocked tasks that never started, of every owner, for the worker's sweep. */
  find_blocked_unstarted(): Promise<TaskRecord[]>;
  /** Every open task of an owner, oldest first. */
  list_open(owner_id: string): Promise<TaskRecord[]>;
  /** Finished delegated tasks of every owner whose delegator has not been given the result. */
  find_unnotified_delegations(): Promise<TaskRecord[]>;
}
