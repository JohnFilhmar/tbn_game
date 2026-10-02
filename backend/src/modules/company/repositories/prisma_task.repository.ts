import { Injectable } from '@nestjs/common';
import type { TaskListQuery, TaskStatus } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { TaskRecord, TaskWrite } from '@/modules/company/types/company_records';
import type { TaskRepository, TaskStatusPatch } from './interface/task_repository.interface';

const with_report = { report: { select: { id: true } } };

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
    from: TaskStatus[],
    status: TaskStatus,
    patch: TaskStatusPatch = {},
  ): Promise<TaskRecord | null> {
    const result = await this.prisma.task.updateMany({
      where: { id, owner_id, status: { in: from } },
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
}
