import type { AgentStatus, Appearance, TaskStatus, ToolPolicies } from '@tbn/contracts';

/** An agent row. `appearance` and `tool_policy` are JSON columns, parsed when mapped. */
export interface AgentRecord {
  id: string;
  owner_id: string;
  name: string;
  role: string;
  job_description: string;
  level: number;
  department_id: string;
  provider_id: string;
  primary_model: string;
  intern_model: string;
  appearance: unknown;
  tool_policy: unknown;
  status: AgentStatus;
  active_run_id: string | null;
  /** When the agent last went idle; null while it works. */
  idle_since: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when an agent is recruited or edited. */
export interface AgentWrite {
  name: string;
  role: string;
  job_description: string;
  provider_id: string;
  primary_model: string;
  intern_model: string;
  appearance: Appearance;
  tool_policy: ToolPolicies;
}

/** A department row with how many agents it holds. */
export interface DepartmentRecord {
  id: string;
  owner_id: string;
  name: string;
  manager_agent_id: string | null;
  member_count: number;
  created_at: Date;
  updated_at: Date;
}

/** A task row with the id of its report when one exists. */
export interface TaskRecord {
  id: string;
  owner_id: string;
  title: string;
  instructions: string;
  assignee_agent_id: string;
  delegator_agent_id: string | null;
  parent_task_id: string | null;
  repository_id: string | null;
  feature_branch: string | null;
  status: TaskStatus;
  status_reason: string | null;
  result: string | null;
  report_id: string | null;
  delegator_notified_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a task is created. */
export interface TaskWrite {
  title: string;
  instructions: string;
  assignee_agent_id: string;
  delegator_agent_id: string | null;
  repository_id?: string | null;
  parent_task_id: string | null;
}

/** A report row. */
export interface ReportRecord {
  id: string;
  owner_id: string;
  task_id: string;
  agent_id: string;
  body_md: string;
  created_at: Date;
}

/** Fields of a new intern. The repository names it after its manager. */
export interface InternWrite {
  role: string;
  job_description: string;
  department_id: string;
  provider_id: string;
  primary_model: string;
  tool_policy: ToolPolicies;
}

/** An idle intern as the worker's sweep sees it, with the status of its manager. */
export interface IdleInternRecord {
  id: string;
  owner_id: string;
  idle_since: Date | null;
  /** Null when the department has no manager any more. */
  manager_status: AgentStatus | null;
}

/** A live agent with the name of its department, for the roster. */
export interface RosterAgentRecord {
  agent: AgentRecord;
  department_name: string;
}

/** One line of the roster: a live agent, its department, and what it works on. */
export interface RosterEntry {
  agent: AgentRecord;
  department_name: string;
  /** The task the agent holds: in progress, blocked or awaiting approval. */
  current_task: TaskRecord | null;
  queued_task_count: number;
}

/** What a new intern is for and where it runs. */
export interface InternSpec {
  role: string;
  job_description: string;
  provider_id: string;
  primary_model: string;
}

/** A task a manager hands to an intern. */
export interface DelegationWrite {
  title: string;
  instructions: string;
  assignee_agent_id: string;
  delegator_agent_id: string;
  parent_task_id: string | null;
}
