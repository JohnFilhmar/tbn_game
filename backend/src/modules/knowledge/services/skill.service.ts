import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateSkillSchema,
  type CreateSkill,
  type Skill,
  type SkillAttachment,
  type UpdateSkill,
} from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import {
  SKILL_REPOSITORY,
  type SkillRepository,
} from '@/modules/knowledge/repositories/interface/skill_repository.interface';
import type { SkillRecord, SkillSummary } from '@/modules/knowledge/types/knowledge_records';
import { SkillMarkdownError, format_skill_markdown, parse_skill_markdown } from './skill_markdown';

/** Maps a skill row to the API shape. */
export function to_skill_view(record: SkillRecord): Skill {
  const attachments: SkillAttachment[] = [];
  for (const attachment of record.attachments) {
    if (attachment.target_type === 'role' && attachment.role !== null) {
      attachments.push({ target_type: 'role', role: attachment.role });
    } else if (attachment.target_type === 'agent' && attachment.agent_id !== null) {
      attachments.push({ target_type: 'agent', agent_id: attachment.agent_id });
    }
  }
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    body: record.body,
    attachments,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Skills: listed by name and description in prompts, loaded in full on demand. */
@Injectable()
export class SkillService {
  constructor(
    @Inject(SKILL_REPOSITORY) private readonly skills: SkillRepository,
    private readonly agents: AgentService,
  ) {}

  async list(owner_id: string): Promise<Skill[]> {
    return (await this.skills.list(owner_id)).map(to_skill_view);
  }

  async get(owner_id: string, id: string): Promise<Skill> {
    return to_skill_view(await this.require(owner_id, id));
  }

  /** @throws ConflictException when the name is taken. */
  async create(owner_id: string, input: CreateSkill): Promise<Skill> {
    if ((await this.skills.find_by_name(owner_id, input.name)) !== null) {
      throw new ConflictException('Skill name is taken');
    }
    return to_skill_view(await this.skills.create(owner_id, input));
  }

  async update(owner_id: string, id: string, input: UpdateSkill): Promise<Skill> {
    if (input.name !== undefined) {
      const same_name = await this.skills.find_by_name(owner_id, input.name);
      if (same_name !== null && same_name.id !== id)
        throw new ConflictException('Skill name is taken');
    }
    const record = await this.skills.update(owner_id, id, input);
    if (record === null) throw new NotFoundException('Skill not found');
    return to_skill_view(record);
  }

  async delete(owner_id: string, id: string): Promise<void> {
    if (!(await this.skills.delete(owner_id, id))) throw new NotFoundException('Skill not found');
  }

  /** Creates a skill from a `SKILL.md` file. */
  async import(owner_id: string, markdown: string): Promise<Skill> {
    let parsed;
    try {
      parsed = parse_skill_markdown(markdown);
    } catch (error: unknown) {
      if (error instanceof SkillMarkdownError) throw new BadRequestException(error.message);
      throw error;
    }
    const input = CreateSkillSchema.safeParse(parsed);
    if (!input.success) {
      throw new BadRequestException(
        `SKILL.md ${input.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
      );
    }
    return this.create(owner_id, input.data);
  }

  /** The skill as a `SKILL.md` file. */
  async export(owner_id: string, id: string): Promise<{ filename: string; markdown: string }> {
    const record = await this.require(owner_id, id);
    return { filename: `${record.name}.SKILL.md`, markdown: format_skill_markdown(record) };
  }

  /** Replaces the skill's attachments. Every agent must belong to the owner. */
  async replace_attachments(
    owner_id: string,
    id: string,
    attachments: SkillAttachment[],
  ): Promise<Skill> {
    for (const attachment of attachments) {
      if (
        attachment.target_type === 'agent' &&
        !(await this.agents.exists(owner_id, attachment.agent_id))
      ) {
        throw new NotFoundException('Agent not found');
      }
    }
    const record = await this.skills.replace_attachments(owner_id, id, attachments);
    if (record === null) throw new NotFoundException('Skill not found');
    return to_skill_view(record);
  }

  /** Names and descriptions of the skills attached to an agent or its role, for the prompt. */
  attached_to(owner_id: string, role: string, agent_id: string): Promise<SkillSummary[]> {
    return this.skills.find_attached(owner_id, role, agent_id);
  }

  /** The body of a skill by name, for the `load_skill` tool. Null when unknown. */
  async body_by_name(owner_id: string, name: string): Promise<string | null> {
    return (await this.skills.find_by_name(owner_id, name))?.body ?? null;
  }

  private async require(owner_id: string, id: string): Promise<SkillRecord> {
    const record = await this.skills.find(owner_id, id);
    if (record === null) throw new NotFoundException('Skill not found');
    return record;
  }
}
