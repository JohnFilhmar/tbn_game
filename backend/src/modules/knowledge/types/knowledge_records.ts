import type { InstructionScope, SkillAttachment } from '@tbn/contracts';

/** An instruction row. */
export interface InstructionRecord {
  id: string;
  owner_id: string;
  scope: InstructionScope;
  role: string | null;
  agent_id: string | null;
  title: string;
  body: string;
  position: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when an instruction is created or edited. */
export interface InstructionWrite {
  scope: InstructionScope;
  role: string | null;
  agent_id: string | null;
  title: string;
  body: string;
  position: number;
  enabled: boolean;
}

/** A skill attachment row. */
export interface SkillAttachmentRecord {
  target_type: 'role' | 'agent';
  role: string | null;
  agent_id: string | null;
}

/** A skill row with its attachments. */
export interface SkillRecord {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  body: string;
  attachments: SkillAttachmentRecord[];
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a skill is created or edited. */
export interface SkillWrite {
  name: string;
  description: string;
  body: string;
}

/** A skill as the prompt lists it: name and description only. */
export interface SkillSummary {
  name: string;
  description: string;
}

/** An attachment as written. */
export type SkillAttachmentWrite = SkillAttachment;

/** A preference row. The value is JSON, checked against the key's schema when read. */
export interface PreferenceRecord {
  key: string;
  value: unknown;
}
