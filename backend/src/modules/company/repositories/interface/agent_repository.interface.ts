import type { AgentListQuery, AgentStatus } from '@tbn/contracts';
import type { AgentRecord, AgentWrite } from '@/modules/company/types/company_records';

/** Injection token for `AgentRepository`. */
export const AGENT_REPOSITORY = Symbol('AGENT_REPOSITORY');

/** Agent rows, scoped by owner. */
export interface AgentRepository {
  list(owner_id: string, query: AgentListQuery): Promise<AgentRecord[]>;
  find(owner_id: string, id: string): Promise<AgentRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<AgentRecord | null>;
  /** Creates a level 1 agent and the department it heads in one transaction. */
  recruit_manager(owner_id: string, data: AgentWrite): Promise<AgentRecord>;
  update(owner_id: string, id: string, data: Partial<AgentWrite>): Promise<AgentRecord | null>;
  set_status(owner_id: string, id: string, status: AgentStatus): Promise<AgentRecord | null>;
  /** Sets `active_run_id` when it is null. Returns false when another run holds the agent. */
  claim_run(owner_id: string, id: string, run_id: string): Promise<boolean>;
  /** Clears `active_run_id` when it equals `run_id`. */
  release_run(owner_id: string, id: string, run_id: string): Promise<void>;
}
