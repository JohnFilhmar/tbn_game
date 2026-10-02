import type {
  SkillAttachmentWrite,
  SkillRecord,
  SkillSummary,
  SkillWrite,
} from '@/modules/knowledge/types/knowledge_records';

/** Injection token for `SkillRepository`. */
export const SKILL_REPOSITORY = Symbol('SKILL_REPOSITORY');

/** Skill rows with their attachments, scoped by owner. */
export interface SkillRepository {
  list(owner_id: string): Promise<SkillRecord[]>;
  find(owner_id: string, id: string): Promise<SkillRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<SkillRecord | null>;
  create(owner_id: string, data: SkillWrite): Promise<SkillRecord>;
  update(owner_id: string, id: string, data: Partial<SkillWrite>): Promise<SkillRecord | null>;
  delete(owner_id: string, id: string): Promise<boolean>;
  /** Replaces every attachment of the skill in one transaction. Null when the skill is missing. */
  replace_attachments(
    owner_id: string,
    id: string,
    attachments: SkillAttachmentWrite[],
  ): Promise<SkillRecord | null>;
  /** Skills attached to the role or to the agent, by name. */
  find_attached(owner_id: string, role: string, agent_id: string): Promise<SkillSummary[]>;
}
