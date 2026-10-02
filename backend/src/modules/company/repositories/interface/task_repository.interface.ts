import type { TaskListQuery, TaskStatus } from '@tbn/contracts';
import type { TaskRecord, TaskWrite } from '@/modules/company/types/company_records';

/** Injection token for `TaskRepository`. */
export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/** Fields a status change may set alongside the status. */
export interface TaskStatusPatch {
  result?: string | null;
  started_at?: Date;
  finished_at?: Date;
}

/** Task rows, scoped by owner. */
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
    from: TaskStatus[],
    status: TaskStatus,
    patch?: TaskStatusPatch,
  ): Promise<TaskRecord | null>;
  /** The oldest queued task of an agent. */
  next_queued_for_agent(owner_id: string, agent_id: string): Promise<TaskRecord | null>;
  /** Cancels every queued task of an agent. Returns how many it cancelled. */
  cancel_queued_for_agent(owner_id: string, agent_id: string): Promise<number>;
}
