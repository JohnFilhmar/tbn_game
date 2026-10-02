import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OPEN_TASK_STATUSES, type CreateTask, type Task, type TaskListQuery } from '@tbn/contracts';
import { QueueService } from '@/lib/queue/queue.service';
import {
  TASK_REPOSITORY,
  type TaskRepository,
} from '@/modules/company/repositories/interface/task_repository.interface';
import type { DelegationWrite, TaskRecord } from '@/modules/company/types/company_records';
import { AgentService, is_live } from './agent.service';
import { GitRecordsService } from './git_records.service';

const CANCELLED_WITH_PARENT = 'Its parent task was cancelled';

/** Maps a task row to the API shape. */
export function to_task_view(record: TaskRecord): Task {
  return {
    id: record.id,
    title: record.title,
    instructions: record.instructions,
    assignee_agent_id: record.assignee_agent_id,
    delegator_agent_id: record.delegator_agent_id,
    parent_task_id: record.parent_task_id,
    repository_id: record.repository_id,
    feature_branch: record.feature_branch,
    status: record.status,
    status_reason: record.status_reason,
    result: record.result,
    report_id: record.report_id,
    started_at: record.started_at?.toISOString() ?? null,
    finished_at: record.finished_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/**
 * Tasks: created by the owner or delegated by a manager, worked by agents one at a time. A task
 * can be blocked while its key cannot be used, or await the owner's approval.
 */
@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly agents: AgentService,
    private readonly queue: QueueService,
    private readonly git_records: GitRecordsService,
  ) {}

  async list(owner_id: string, query: TaskListQuery): Promise<Task[]> {
    return (await this.tasks.list(owner_id, query)).map(to_task_view);
  }

  async get(owner_id: string, id: string): Promise<Task> {
    return to_task_view(await this.require(owner_id, id));
  }

  /** Queues a task for an agent and wakes the agent. */
  async create(owner_id: string, input: CreateTask): Promise<Task> {
    const agent = await this.agents.require(owner_id, input.assignee_agent_id);
    if (!is_live(agent.status)) throw new ConflictException(`Agent is ${agent.status}`);
    if (input.repository_id !== undefined && input.repository_id !== null) {
      await this.git_records.require_repository(owner_id, input.repository_id);
    }
    const record = await this.tasks.create(owner_id, {
      title: input.title,
      instructions: input.instructions,
      assignee_agent_id: agent.id,
      delegator_agent_id: null,
      parent_task_id: null,
      repository_id: input.repository_id ?? null,
    });
    await this.queue.send_agent_wake({ owner_id, agent_id: agent.id });
    return to_task_view(record);
  }

  /**
   * Queues a task a manager hands to an intern and wakes the intern, for the runtime.
   *
   * @throws ConflictException when the intern is gone.
   */
  async delegate(owner_id: string, input: DelegationWrite): Promise<TaskRecord> {
    const assignee = await this.agents.require(owner_id, input.assignee_agent_id);
    if (!is_live(assignee.status)) throw new ConflictException(`Agent is ${assignee.status}`);
    const record = await this.tasks.create(owner_id, input);
    await this.queue.send_agent_wake({ owner_id, agent_id: assignee.id });
    return record;
  }

  /**
   * Cancels an open task and its open subtasks. Their agents are woken so a running or paused run
   * stops, and the delegator is woken to hear about it.
   */
  async cancel(owner_id: string, id: string): Promise<Task> {
    const record = await this.tasks.transition(owner_id, id, OPEN_TASK_STATUSES, 'cancelled', {
      finished_at: new Date(),
      status_reason: null,
    });
    if (record === null) {
      await this.require(owner_id, id);
      throw new ConflictException('Task is already finished');
    }
    const cancelled = [record, ...(await this.cancel_descendants(owner_id, record.id))];
    const to_wake = new Set<string>();
    for (const task of cancelled) {
      to_wake.add(task.assignee_agent_id);
      if (task.delegator_agent_id !== null) to_wake.add(task.delegator_agent_id);
    }
    for (const agent_id of to_wake) await this.queue.send_agent_wake({ owner_id, agent_id });
    return to_task_view(record);
  }

  /** Every open task of the owner as rows, for the branch rules. */
  list_open_records(owner_id: string): Promise<TaskRecord[]> {
    return this.tasks.list_open(owner_id);
  }

  /** Moves a started task to `blocked` while its key cannot be used. Null when it is not open. */
  block(owner_id: string, id: string, reason: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['in_progress', 'blocked'], 'blocked', {
      status_reason: reason,
    });
  }

  /** Sets or clears the reason on a task in progress, such as the subtasks it waits for. */
  set_reason(owner_id: string, id: string, reason: string | null): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['in_progress'], 'in_progress', {
      status_reason: reason,
    });
  }

  /** Moves a blocked task back to `in_progress` when its run resumes. */
  unblock(owner_id: string, id: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['blocked'], 'in_progress', { status_reason: null });
  }

  /** Moves a task to `awaiting_approval`: its run asks the owner whether to go on. */
  await_approval(owner_id: string, id: string, reason: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['in_progress', 'blocked'], 'awaiting_approval', {
      status_reason: reason,
    });
  }

  /** The owner said go on: the task is back in progress. */
  approve(owner_id: string, id: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['awaiting_approval'], 'in_progress', {
      status_reason: null,
    });
  }

  /**
   * Blocks every queued and in-progress task of the given agents, as when their key ran out of
   * credit. Returns how many it blocked.
   */
  block_open_for_agents(owner_id: string, agent_ids: string[], reason: string): Promise<number> {
    return this.tasks.block_open_for_agents(owner_id, agent_ids, reason);
  }

  /** Returns a blocked task that never started to the queue and wakes its agent. */
  async requeue_unstarted(owner_id: string, task: TaskRecord): Promise<void> {
    if (task.started_at !== null) return;
    const queued = await this.tasks.transition(owner_id, task.id, ['blocked'], 'queued', {
      status_reason: null,
    });
    if (queued !== null) {
      await this.queue.send_agent_wake({ owner_id, agent_id: task.assignee_agent_id });
    }
  }

  /** Blocked tasks that never started, of every owner, for the worker's sweep. */
  find_blocked_unstarted(): Promise<TaskRecord[]> {
    return this.tasks.find_blocked_unstarted();
  }

  /** Open direct subtasks of a task. */
  async open_children(owner_id: string, parent_id: string): Promise<TaskRecord[]> {
    const children = await this.tasks.list_children(owner_id, [parent_id]);
    return children.filter((task) => OPEN_TASK_STATUSES.includes(task.status));
  }

  /** Direct subtasks of a task, oldest first. */
  children(owner_id: string, parent_id: string): Promise<TaskRecord[]> {
    return this.tasks.list_children(owner_id, [parent_id]);
  }

  /** The ids of a task and every task beneath it. */
  async tree_ids(owner_id: string, root_id: string): Promise<string[]> {
    const ids = [root_id];
    let frontier = [root_id];
    while (frontier.length > 0) {
      frontier = (await this.tasks.list_children(owner_id, frontier)).map((task) => task.id);
      ids.push(...frontier);
    }
    return ids;
  }

  /** Finished tasks an agent delegated whose results it has not been given. */
  finished_unnotified(owner_id: string, delegator_agent_id: string): Promise<TaskRecord[]> {
    return this.tasks.finished_unnotified(owner_id, delegator_agent_id);
  }

  /** Records that the delegator has the result. False when it already had. */
  mark_delegator_notified(owner_id: string, id: string): Promise<boolean> {
    return this.tasks.mark_delegator_notified(owner_id, id);
  }

  /** Finished delegated tasks of every owner whose delegator was not told, for the sweep. */
  find_unnotified_delegations(): Promise<TaskRecord[]> {
    return this.tasks.find_unnotified_delegations();
  }

  private async cancel_descendants(owner_id: string, root_id: string): Promise<TaskRecord[]> {
    const cancelled: TaskRecord[] = [];
    let frontier = [root_id];
    while (frontier.length > 0) {
      const children = await this.tasks.list_children(owner_id, frontier);
      frontier = children.map((task) => task.id);
      for (const child of children) {
        const record = await this.tasks.transition(
          owner_id,
          child.id,
          OPEN_TASK_STATUSES,
          'cancelled',
          { finished_at: new Date(), status_reason: CANCELLED_WITH_PARENT },
        );
        if (record !== null) cancelled.push(record);
      }
    }
    return cancelled;
  }

  /** The oldest queued task of an agent, for the runtime. */
  next_queued_for_agent(owner_id: string, agent_id: string): Promise<TaskRecord | null> {
    return this.tasks.next_queued_for_agent(owner_id, agent_id);
  }

  /** The row itself, for the runtime. */
  async require(owner_id: string, id: string): Promise<TaskRecord> {
    const record = await this.tasks.find(owner_id, id);
    if (record === null) throw new NotFoundException('Task not found');
    return record;
  }

  /** Marks a queued task as in progress. Null when it was cancelled first. */
  start(owner_id: string, id: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['queued'], 'in_progress', {
      started_at: new Date(),
      status_reason: null,
    });
  }

  /** Marks a running task as done with its outcome. Null when it was cancelled first. */
  complete(owner_id: string, id: string, result: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['in_progress'], 'done', {
      result,
      status_reason: null,
      finished_at: new Date(),
    });
  }

  /** Marks an open task as failed with the reason. Null when it was cancelled first. */
  fail(owner_id: string, id: string, reason: string): Promise<TaskRecord | null> {
    return this.tasks.transition(
      owner_id,
      id,
      ['in_progress', 'blocked', 'awaiting_approval'],
      'failed',
      { result: reason, status_reason: null, finished_at: new Date() },
    );
  }
}
