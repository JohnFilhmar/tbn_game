import { Injectable } from '@nestjs/common';
import type { SandboxJobListQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { SandboxJobRecord, SandboxJobWrite } from '@/modules/runtime/types/sandbox_job_record';
import type { SandboxJobRepository } from './interface/sandbox_job_repository.interface';

const LIST_LIMIT = 200;

/** `SandboxJobRepository` on Prisma. */
@Injectable()
export class PrismaSandboxJobRepository implements SandboxJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(owner_id: string, write: SandboxJobWrite): Promise<SandboxJobRecord> {
    return this.prisma.sandboxJob.create({
      data: {
        owner_id,
        run_id: write.run_id,
        agent_id: write.agent_id,
        kind: write.kind,
        spec: write.spec,
      },
    });
  }

  find(owner_id: string, id: string): Promise<SandboxJobRecord | null> {
    return this.prisma.sandboxJob.findFirst({ where: { id, owner_id } });
  }

  list(owner_id: string, query: SandboxJobListQuery): Promise<SandboxJobRecord[]> {
    return this.prisma.sandboxJob.findMany({
      where: {
        owner_id,
        ...(query.run_id !== undefined && { run_id: query.run_id }),
        ...(query.agent_id !== undefined && { agent_id: query.agent_id }),
        ...(query.status !== undefined && { status: query.status }),
      },
      orderBy: { created_at: 'desc' },
      take: LIST_LIMIT,
    });
  }

  async mark_lost(owner_id: string, id: string, error: string): Promise<SandboxJobRecord | null> {
    const result = await this.prisma.sandboxJob.updateMany({
      where: { id, owner_id, status: { in: ['queued', 'running'] } },
      data: { status: 'lost', error, finished_at: new Date() },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }
}
