import { Injectable } from '@nestjs/common';
import type { RunListQuery, RunStatus } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { RunRecord } from '@/modules/runtime/types/run_record';
import type { RunRepository } from './interface/run_repository.interface';

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
        OR: [{ lease_owner: null }, { lease_owner }, { lease_expires_at: { lt: new Date() } }],
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

  async increment_turn(owner_id: string, id: string): Promise<number> {
    const run = await this.prisma.run.update({
      where: { id, owner_id },
      data: { turn_count: { increment: 1 } },
      select: { turn_count: true },
    });
    return run.turn_count;
  }

  async finish(
    owner_id: string,
    id: string,
    status: Exclude<RunStatus, 'running'>,
    error: string | null,
  ): Promise<void> {
    await this.prisma.run.updateMany({
      where: { id, owner_id, status: 'running' },
      data: { status, error, finished_at: new Date(), lease_owner: null, lease_expires_at: null },
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
