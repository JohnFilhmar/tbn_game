import { Injectable } from '@nestjs/common';
import type { InstructionListQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_record_not_found } from '@/lib/database/prisma_errors';
import type {
  InstructionRecord,
  InstructionWrite,
} from '@/modules/knowledge/types/knowledge_records';
import type { InstructionRepository } from './interface/instruction_repository.interface';

const SCOPE_ORDER = { global: 0, role: 1, agent: 2 } as const;

/** `InstructionRepository` on Prisma. */
@Injectable()
export class PrismaInstructionRepository implements InstructionRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: InstructionListQuery): Promise<InstructionRecord[]> {
    return this.prisma.instruction.findMany({
      where: {
        owner_id,
        ...(query.scope !== undefined && { scope: query.scope }),
        ...(query.agent_id !== undefined && { agent_id: query.agent_id }),
      },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
  }

  find(owner_id: string, id: string): Promise<InstructionRecord | null> {
    return this.prisma.instruction.findFirst({ where: { id, owner_id } });
  }

  create(owner_id: string, data: InstructionWrite): Promise<InstructionRecord> {
    return this.prisma.instruction.create({ data: { owner_id, ...data } });
  }

  async update(
    owner_id: string,
    id: string,
    data: Partial<InstructionWrite>,
  ): Promise<InstructionRecord | null> {
    const result = await this.prisma.instruction.updateMany({ where: { id, owner_id }, data });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    try {
      await this.prisma.instruction.delete({ where: { id, owner_id } });
      return true;
    } catch (error: unknown) {
      if (is_record_not_found(error)) return false;
      throw error;
    }
  }

  async find_for_prompt(
    owner_id: string,
    role: string,
    agent_id: string,
  ): Promise<InstructionRecord[]> {
    const rows = await this.prisma.instruction.findMany({
      where: {
        owner_id,
        enabled: true,
        OR: [{ scope: 'global' }, { scope: 'role', role }, { scope: 'agent', agent_id }],
      },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
    return rows.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]);
  }
}
