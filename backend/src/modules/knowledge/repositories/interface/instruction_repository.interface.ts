import type { InstructionListQuery } from '@tbn/contracts';
import type {
  InstructionRecord,
  InstructionWrite,
} from '@/modules/knowledge/types/knowledge_records';

/** Injection token for `InstructionRepository`. */
export const INSTRUCTION_REPOSITORY = Symbol('INSTRUCTION_REPOSITORY');

/** Instruction rows, scoped by owner. */
export interface InstructionRepository {
  list(owner_id: string, query: InstructionListQuery): Promise<InstructionRecord[]>;
  find(owner_id: string, id: string): Promise<InstructionRecord | null>;
  create(owner_id: string, data: InstructionWrite): Promise<InstructionRecord>;
  update(
    owner_id: string,
    id: string,
    data: Partial<InstructionWrite>,
  ): Promise<InstructionRecord | null>;
  delete(owner_id: string, id: string): Promise<boolean>;
  /** Enabled instructions for one agent: global ones, its role's, then its own, by position. */
  find_for_prompt(owner_id: string, role: string, agent_id: string): Promise<InstructionRecord[]>;
}
