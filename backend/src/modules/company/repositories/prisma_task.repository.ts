import { Injectable } from '@nestjs/common';
import {
  OPEN_TASK_STATUSES,
  SubtaskOutcomeSchema,
  type TaskListQuery,
  type TaskStatus,
} from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { TaskRecord, TaskWrite } from '@/modules/company/types/company_records';
import type { TaskRepository, TaskStatusPatch } from './interface/task_repository.interface';

const with_report = { report: { select: { id: true } } };

const FINISHED: TaskStatus[] = SubtaskOutcomeSchema.options;

interface TaskRow extends Omit<TaskRecord, 'report_id'> {
  report: { id: string } | null;
}

function to_record({ report, ...row }: TaskRow): TaskRecord {
  return { ...row, report_id: report?.id ?? null };
}

/** `TaskRepository` on Prisma. */
@Injectable()
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(owner_id: string, query: TaskListQuery): Promise<TaskRecord[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        owner_id,
        ...(query.status !== undefined && { status: query.status }),
        ...(query.agent_id !== undefined && { assignee_agent_id: query.agent_id }),
        ...(query.parent_task_id !== undefined && { parent_task_id: query.parent_task_id }),
      },
      include: with_report,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(to_record);
  }

  async find(owner_id: string, id: string): Promise<TaskRecord | null> {
    const row = await this.prisma.task.findFirst({ where: { id, owner_id }, include: with_report });
    return row === null ? null : to_record(row);
  }

  async create(owner_id: string, data: TaskWrite): Promise<TaskRecord> {
    const row = await this.prisma.task.create({
      data: { owner_id, ...data },
      include: with_report,
    });
    return to_record(row);
  }

  async transition(
    owner_id: string,
    id: string,
    from: readonly TaskStatus[],
    status: TaskStatus,
    patch: TaskStatusPatch = {},
  ): Promise<TaskRecord | null> {
    const result = await this.prisma.task.updateMany({
      where: { id, owner_id, status: { in: [...from] } },
      data: { status, ...patch },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async next_queued_for_agent(owner_id: string, agent_id: string): Promise<TaskRecord | null> {
    const row = await this.prisma.task.findFirst({
      where: { owner_id, assignee_agent_id: agent_id, status: 'queued' },
      include: with_report,
      orderBy: { created_at: 'asc' },
    });
    return row === null ? null : to_record(row);
  }

  async cancel_queued_for_agent(owner_id: string, agent_id: string): Promise<number> {
    const result = await this.prisma.task.updateMany({
      where: { owner_id, assignee_agent_id: agent_id, status: 'queued' },
      data: { status: 'cancelled', finished_at: new Date() },
    });
    return result.count;
  }

  async list_children(owner_id: string, parent_ids: string[]): Promise<TaskRecord[]> {
    if (parent_ids.length === 0) return [];
    const rows = await this.prisma.task.findMany({
      where: { owner_id, parent_task_id: { in: parent_ids } },
      include: with_report,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(to_record);
  }

  async finished_unnotified(owner_id: string, delegator_agent_id: string): Promise<TaskRecord[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        owner_id,
        delegator_agent_id,
        status: { in: FINISHED },
        delegator_notified_at: null,
      },
      include: with_report,
      orderBy: { finished_at: 'asc' },
    });
    return rows.map(to_record);
  }

  async mark_delegator_notified(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.task.updateMany({
      where: { id, owner_id, delegator_notified_at: null },
      data: { delegator_notified_at: new Date() },
    });
    return result.count === 1;
  }

  async block_open_for_agents(
    owner_id: string,
    agent_ids: string[],
    reason: string,
  ): Promise<number> {
    if (agent_ids.length === 0) return 0;
    const result = await this.prisma.task.updateMany({
      where: {
        owner_id,
        assignee_agent_id: { in: agent_ids },
        status: { in: ['queued', 'in_progress'] },
      },
      data: { status: 'blocked', status_reason: reason },
    });
    return result.count;
  }

  async find_blocked_unstarted(): Promise<TaskRecord[]> {
    const rows = await this.prisma.task.findMany({
      where: { status: 'blocked', started_at: null },
      include: with_report,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(to_record);
  }

  async list_open(owner_id: string): Promise<TaskRecord[]> {
    const rows = await this.prisma.task.findMany({
      where: { owner_id, status: { in: [...OPEN_TASK_STATUSES] } },
      include: with_report,
      orderBy: { created_at: 'asc' },
    });
    return rows.map(to_record);
  }

  async find_unnotified_delegations(): Promise<TaskRecord[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        delegator_agent_id: { not: null },
        status: { in: FINISHED },
        delegator_notified_at: null,
      },
      include: with_report,
      orderBy: { finished_at: 'asc' },
    });
    return rows.map(to_record);
  }
}
