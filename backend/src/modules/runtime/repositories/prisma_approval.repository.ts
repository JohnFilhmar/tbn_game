import { Injectable } from '@nestjs/common';
import type { ApprovalKind, ApprovalListQuery, ApprovalStatus } from '@tbn/contracts';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type { ApprovalRecord, ApprovalWrite } from '@/modules/runtime/types/approval_record';
import type { ApprovalRepository } from './interface/approval_repository.interface';

const LIST_LIMIT = 200;

/** A tool input as JSON, which every tool input is: the model sends JSON. */
const PayloadSchema = z.record(z.string(), z.json());

const SourcesSchema = z.array(
  z.object({ kind: z.string(), reference: z.string(), cached: z.boolean() }),
);

/** `ApprovalRepository` on Prisma. */
@Injectable()
export class PrismaApprovalRepository implements ApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: ApprovalListQuery): Promise<ApprovalRecord[]> {
    return this.prisma.approval.findMany({
      where: {
        owner_id,
        ...(query.status !== undefined && { status: query.status }),
        ...(query.agent_id !== undefined && { agent_id: query.agent_id }),
      },
      orderBy: { created_at: 'desc' },
      take: LIST_LIMIT,
    });
  }

  find(owner_id: string, id: string): Promise<ApprovalRecord | null> {
    return this.prisma.approval.findFirst({ where: { id, owner_id } });
  }

  latest_for_call(
    owner_id: string,
    run_id: string,
    tool_use_id: string,
  ): Promise<ApprovalRecord | null> {
    return this.prisma.approval.findFirst({
      where: { owner_id, run_id, tool_use_id },
      orderBy: { created_at: 'desc' },
    });
  }

  pending_for_run(
    owner_id: string,
    run_id: string,
    kind?: ApprovalKind,
  ): Promise<ApprovalRecord[]> {
    return this.prisma.approval.findMany({
      where: { owner_id, run_id, status: 'pending', ...(kind !== undefined && { kind }) },
      orderBy: { created_at: 'asc' },
    });
  }

  create(owner_id: string, write: ApprovalWrite): Promise<ApprovalRecord> {
    return this.prisma.approval.create({
      data: {
        owner_id,
        run_id: write.run_id,
        agent_id: write.agent_id,
        task_id: write.task_id,
        kind: write.kind,
        tool_name: write.tool_name,
        tool_use_id: write.tool_use_id,
        payload: PayloadSchema.parse(write.payload),
        preview: write.preview,
        sources: SourcesSchema.parse(write.sources),
      },
    });
  }

  async decide(
    owner_id: string,
    id: string,
    status: Exclude<ApprovalStatus, 'pending'>,
    note: string | null,
  ): Promise<ApprovalRecord | null> {
    const result = await this.prisma.approval.updateMany({
      where: { id, owner_id, status: 'pending' },
      data: { status, note, decided_at: new Date() },
    });
    return result.count === 0 ? null : this.find(owner_id, id);
  }
}
