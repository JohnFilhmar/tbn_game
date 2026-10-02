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
