import type { AgentListQuery, AgentStatus } from '@tbn/contracts';
import type {
  AgentRecord,
  AgentWrite,
  IdleInternRecord,
  InternWrite,
  RosterAgentRecord,
} from '@/modules/company/types/company_records';

/** Injection token for `AgentRepository`. */
export const AGENT_REPOSITORY = Symbol('AGENT_REPOSITORY');

/** Which live agents to count. */
export interface LiveAgentFilter {
  department_id?: string;
  level?: 1 | 2;
}

/** Agent rows, scoped by owner except for the worker's idle intern scan. */
export interface AgentRepository {
  list(owner_id: string, query: AgentListQuery): Promise<AgentRecord[]>;
  find(owner_id: string, id: string): Promise<AgentRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<AgentRecord | null>;
  /** Creates a level 1 agent and the department it heads in one transaction. */
  recruit_manager(owner_id: string, data: AgentWrite): Promise<AgentRecord>;
  /**
   * Creates a level 2 agent in `data.department_id`, named `<name_prefix> intern <n>` with the
   * next free number.
   */
  spawn_intern(owner_id: string, name_prefix: string, data: InternWrite): Promise<AgentRecord>;
  update(owner_id: string, id: string, data: Partial<AgentWrite>): Promise<AgentRecord | null>;
  set_status(owner_id: string, id: string, status: AgentStatus): Promise<AgentRecord | null>;
  /** Sets `active_run_id` when it is null. Returns false when another run holds the agent. */
  claim_run(owner_id: string, id: string, run_id: string): Promise<boolean>;
  /** Clears `active_run_id` when it equals `run_id`, and records when the agent went idle. */
  release_run(owner_id: string, id: string, run_id: string): Promise<void>;
  /** Interns of a department with no active run and no open task, oldest first. */
  idle_interns(owner_id: string, department_id: string): Promise<AgentRecord[]>;
  /** How many agents are neither dismissed nor terminated. */
  count_live(owner_id: string, filter: LiveAgentFilter): Promise<number>;
  /** Every live agent with its department's name, oldest first. */
  list_live(owner_id: string): Promise<RosterAgentRecord[]>;
  /** Live agents that run on a provider. */
  list_on_provider(owner_id: string, provider_id: string): Promise<AgentRecord[]>;
  /**
   * Terminates an intern that is idle with no open task, and when `idle_before` is given, idle
   * since before then. Returns false when it is not.
   */
  terminate_idle_intern(owner_id: string, id: string, idle_before: Date | null): Promise<boolean>;
  /** Idle interns of every owner with no active run, for the worker's sweep. */
  find_idle_interns(): Promise<IdleInternRecord[]>;
}
