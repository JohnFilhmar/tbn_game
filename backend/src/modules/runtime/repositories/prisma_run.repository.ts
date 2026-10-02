import { Injectable } from '@nestjs/common';
import type { RunListQuery, RunPauseReason, RunStatus } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { RunRecord } from '@/modules/runtime/types/run_record';
import type { RunRepository, TurnCounts } from './interface/run_repository.interface';

/** `RunRepository` on Prisma. */
@Injectable()
export class PrismaRunRepository implements RunRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: RunListQuery): Promise<RunRecord[]> {
    return this.prisma.run.findMany({
      where: {
        owner_id,
        ...(query.agent_id !== undefined && { agent_id: query.agent_id }),
        ...(query.status !== undefined && { status: query.status }),
      },
      orderBy: { started_at: 'desc' },
    });
  }

  find(owner_id: string, id: string): Promise<RunRecord | null> {
    return this.prisma.run.findFirst({ where: { id, owner_id } });
  }

  create(owner_id: string, agent_id: string, task_id: string | null): Promise<RunRecord> {
    return this.prisma.run.create({ data: { owner_id, agent_id, task_id } });
  }

  async acquire_lease(
    owner_id: string,
    id: string,
    lease_owner: string,
    until: Date,
  ): Promise<RunRecord | null> {
    const result = await this.prisma.run.updateMany({
      where: {
        id,
        owner_id,
        status: 'running',
        OR: [{ lease_owner: null }, { lease_expires_at: { lt: new Date() } }],
      },
      data: { lease_owner, lease_expires_at: until },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async extend_lease(
    owner_id: string,
    id: string,
    lease_owner: string,
    until: Date,
  ): Promise<boolean> {
    const result = await this.prisma.run.updateMany({
      where: { id, owner_id, lease_owner, status: 'running' },
      data: { lease_expires_at: until },
    });
    return result.count === 1;
  }

  async release_lease(owner_id: string, id: string, lease_owner: string): Promise<void> {
    await this.prisma.run.updateMany({
      where: { id, owner_id, lease_owner },
      data: { lease_owner: null, lease_expires_at: null },
    });
  }

  increment_turn(owner_id: string, id: string): Promise<TurnCounts> {
    return this.prisma.run.update({
      where: { id, owner_id },
      data: { turn_count: { increment: 1 }, guard_turns: { increment: 1 } },
      select: { turn_count: true, guard_turns: true },
    });
  }

  async pause(
    owner_id: string,
    id: string,
    lease_owner: string,
    reason: RunPauseReason,
    resume_at: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.run.updateMany({
      where: { id, owner_id, lease_owner, status: 'running' },
      data: {
        status: 'paused',
        pause_reason: reason,
        resume_at,
        lease_owner: null,
        lease_expires_at: null,
      },
    });
    return result.count === 1;
  }

  async resume(
    owner_id: string,
    id: string,
    lease_owner: string,
    until: Date,
    reset_guard: boolean,
  ): Promise<RunRecord | null> {
    const result = await this.prisma.run.updateMany({
      where: { id, owner_id, status: 'paused' },
      data: {
        status: 'running',
        pause_reason: null,
        resume_at: null,
        lease_owner,
        lease_expires_at: until,
        ...(reset_guard && { guard_turns: 0 }),
      },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async continue_after_guard(owner_id: string, id: string): Promise<RunRecord | null> {
    const result = await this.prisma.run.updateMany({
      where: { id, owner_id, status: 'paused', pause_reason: 'runaway_guard' },
      data: {
        status: 'running',
        pause_reason: null,
        resume_at: null,
        guard_turns: 0,
        lease_owner: null,
        lease_expires_at: null,
      },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async finish(
    owner_id: string,
    id: string,
    status: Exclude<RunStatus, 'running' | 'paused'>,
    error: string | null,
  ): Promise<RunRecord | null> {
    const result = await this.prisma.run.updateMany({
      where: { id, owner_id, status: { in: ['running', 'paused'] } },
      data: {
        status,
        error,
        finished_at: new Date(),
        pause_reason: null,
        resume_at: null,
        lease_owner: null,
        lease_expires_at: null,
      },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async ids_for_tasks(owner_id: string, task_ids: string[]): Promise<string[]> {
    if (task_ids.length === 0) return [];
    const rows = await this.prisma.run.findMany({
      where: { owner_id, task_id: { in: task_ids } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  find_paused(reasons: RunPauseReason[], due_before: Date | null): Promise<RunRecord[]> {
    return this.prisma.run.findMany({
      where: {
        status: 'paused',
        pause_reason: { in: reasons },
        ...(due_before !== null && { resume_at: { lte: due_before } }),
      },
      orderBy: { started_at: 'asc' },
    });
  }

  find_orphaned(now: Date): Promise<RunRecord[]> {
    return this.prisma.run.findMany({
      where: {
        status: 'running',
        OR: [{ lease_expires_at: null }, { lease_expires_at: { lt: now } }],
      },
      orderBy: { started_at: 'asc' },
    });
  }
}
