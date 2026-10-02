import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_record_not_found } from '@/lib/database/prisma_errors';
import type {
  SkillAttachmentWrite,
  SkillRecord,
  SkillSummary,
  SkillWrite,
} from '@/modules/knowledge/types/knowledge_records';
import type { SkillRepository } from './interface/skill_repository.interface';

const with_attachments = {
  attachments: {
    select: { target_type: true, role: true, agent_id: true },
    orderBy: { created_at: 'asc' as const },
  },
};

/** `SkillRepository` on Prisma. */
@Injectable()
export class PrismaSkillRepository implements SkillRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<SkillRecord[]> {
    return this.prisma.skill.findMany({
      where: { owner_id },
      include: with_attachments,
      orderBy: { name: 'asc' },
    });
  }

  find(owner_id: string, id: string): Promise<SkillRecord | null> {
    return this.prisma.skill.findFirst({ where: { id, owner_id }, include: with_attachments });
  }

  find_by_name(owner_id: string, name: string): Promise<SkillRecord | null> {
    return this.prisma.skill.findFirst({ where: { owner_id, name }, include: with_attachments });
  }

  create(owner_id: string, data: SkillWrite): Promise<SkillRecord> {
    return this.prisma.skill.create({ data: { owner_id, ...data }, include: with_attachments });
  }

  async update(
    owner_id: string,
    id: string,
    data: Partial<SkillWrite>,
  ): Promise<SkillRecord | null> {
    const result = await this.prisma.skill.updateMany({ where: { id, owner_id }, data });
    return result.count === 0 ? null : this.find(owner_id, id);
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    try {
      await this.prisma.skill.delete({ where: { id, owner_id } });
      return true;
    } catch (error: unknown) {
      if (is_record_not_found(error)) return false;
      throw error;
    }
  }

  replace_attachments(
    owner_id: string,
    id: string,
    attachments: SkillAttachmentWrite[],
  ): Promise<SkillRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const skill = await tx.skill.findFirst({ where: { id, owner_id } });
      if (skill === null) return null;
      await tx.skillAttachment.deleteMany({ where: { skill_id: id } });
      await tx.skillAttachment.createMany({
        data: attachments.map((attachment) => ({
          owner_id,
          skill_id: id,
          target_type: attachment.target_type,
          role: attachment.target_type === 'role' ? attachment.role : null,
          agent_id: attachment.target_type === 'agent' ? attachment.agent_id : null,
        })),
      });
      return tx.skill.findFirst({ where: { id, owner_id }, include: with_attachments });
    });
  }

  async find_attached(owner_id: string, role: string, agent_id: string): Promise<SkillSummary[]> {
    return this.prisma.skill.findMany({
      where: {
        owner_id,
        attachments: {
          some: {
            OR: [
              { target_type: 'role', role },
              { target_type: 'agent', agent_id },
            ],
          },
        },
      },
      select: { name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }
}
