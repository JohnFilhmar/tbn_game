import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTask, Task, TaskListQuery, TaskStatus } from '@tbn/contracts';
import { QueueService } from '@/lib/queue/queue.service';
import {
  TASK_REPOSITORY,
  type TaskRepository,
} from '@/modules/company/repositories/interface/task_repository.interface';
import type { TaskRecord } from '@/modules/company/types/company_records';
import { AgentService } from './agent.service';

const OPEN_STATUSES: TaskStatus[] = ['queued', 'in_progress', 'blocked', 'awaiting_approval'];

/** Maps a task row to the API shape. */
export function to_task_view(record: TaskRecord): Task {
  return {
    id: record.id,
    title: record.title,
    instructions: record.instructions,
    assignee_agent_id: record.assignee_agent_id,
    delegator_agent_id: record.delegator_agent_id,
    parent_task_id: record.parent_task_id,
    status: record.status,
    result: record.result,
    report_id: record.report_id,
    started_at: record.started_at?.toISOString() ?? null,
    finished_at: record.finished_at?.toISOString() ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Tasks: created by the owner, worked by agents one at a time. */
@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly agents: AgentService,
    private readonly queue: QueueService,
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
    if (agent.status === 'dismissed') throw new ConflictException('Agent is dismissed');
    const record = await this.tasks.create(owner_id, {
      title: input.title,
      instructions: input.instructions,
      assignee_agent_id: agent.id,
      delegator_agent_id: null,
      parent_task_id: null,
    });
    await this.queue.send_agent_wake({ owner_id, agent_id: agent.id });
    return to_task_view(record);
  }

  /** Cancels an open task. A running one stops at its next model turn. */
  async cancel(owner_id: string, id: string): Promise<Task> {
    const record = await this.tasks.transition(owner_id, id, OPEN_STATUSES, 'cancelled', {
      finished_at: new Date(),
    });
    if (record === null) {
      await this.require(owner_id, id);
      throw new ConflictException('Task is already finished');
    }
    return to_task_view(record);
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
    });
  }

  /** Marks a running task as done with its outcome. Null when it was cancelled first. */
  complete(owner_id: string, id: string, result: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['in_progress'], 'done', {
      result,
      finished_at: new Date(),
    });
  }

  /** Marks a running task as failed with the reason. Null when it was cancelled first. */
  fail(owner_id: string, id: string, reason: string): Promise<TaskRecord | null> {
    return this.tasks.transition(owner_id, id, ['in_progress'], 'failed', {
      result: reason,
      finished_at: new Date(),
    });
  }
}
