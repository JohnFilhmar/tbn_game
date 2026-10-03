import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { ModelIdSchema } from './providers';

/** A role name, which also names the department a manager heads. */
export const RoleNameSchema = z.string().trim().min(1).max(100);

/** Level 1 agents are managers, level 2 agents are interns. */
export const AgentLevelSchema = z.union([z.literal(1), z.literal(2)]);

/** `1` or `2`. */
export type AgentLevel = z.infer<typeof AgentLevelSchema>;

/**
 * Whether an agent is waiting, working or gone. The owner dismisses agents; the runtime terminates
 * interns that stay idle past the owner's timeout.
 */
export const AgentStatusSchema = z.enum(['idle', 'working', 'dismissed', 'terminated']);

/** `idle`, `working`, `dismissed` or `terminated`. */
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** What happens when an agent calls a tool. */
export const ToolPolicySchema = z.enum(['auto', 'ask', 'deny']);

/** `auto`, `ask` or `deny`. */
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;

/** Tool name as the runtime registers it. */
export const ToolNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

/** Policy per tool name. A tool without an entry uses its default policy. */
export const ToolPoliciesSchema = z.record(ToolNameSchema, ToolPolicySchema);

/** Policy per tool name. */
export type ToolPolicies = z.infer<typeof ToolPoliciesSchema>;

const PartSchema = z.string().trim().min(1).max(64);

/** Modular parts and palette swaps of a character. Saved data; the client renders it. */
export const AppearanceSchema = z.strictObject({
  body: PartSchema.optional(),
  hair: PartSchema.optional(),
  outfit: PartSchema.optional(),
  accessory: PartSchema.optional(),
  colors: z.record(PartSchema, z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
});

/** A character's appearance. */
export type Appearance = z.infer<typeof AppearanceSchema>;

/** An agent: a level 1 manager or a level 2 intern. */
export const AgentSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(100),
  role: RoleNameSchema,
  job_description: z.string().trim().min(1).max(5_000),
  level: AgentLevelSchema,
  department_id: IdSchema,
  provider_id: IdSchema,
  primary_model: ModelIdSchema,
  intern_model: ModelIdSchema,
  appearance: AppearanceSchema,
  tool_policy: ToolPoliciesSchema,
  status: AgentStatusSchema,
  active_run_id: IdSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** An agent as the API returns it. */
export type Agent = z.infer<typeof AgentSchema>;

/** Body of `POST /agents`: recruits a level 1 agent, which heads a department named after its role. */
export const RecruitAgentSchema = AgentSchema.pick({
  name: true,
  role: true,
  job_description: true,
  provider_id: true,
  primary_model: true,
  intern_model: true,
  appearance: true,
  tool_policy: true,
}).partial({ appearance: true, tool_policy: true });

/** Body of `POST /agents`. */
export type RecruitAgent = z.infer<typeof RecruitAgentSchema>;

/** Body of `PATCH /agents/:id`. */
export const UpdateAgentSchema = RecruitAgentSchema.partial();

/** Body of `PATCH /agents/:id`. */
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;

/** Query of `GET /agents`. */
export const AgentListQuerySchema = z.strictObject({
  department_id: IdSchema.optional(),
  status: AgentStatusSchema.optional(),
  level: z.coerce.number().pipe(AgentLevelSchema).optional(),
});

/** Query of `GET /agents`. */
export type AgentListQuery = z.infer<typeof AgentListQuerySchema>;

/**
 * What an agent has attached beyond its built-in tools: the integrations it may call and the
 * plugins whose tools it sees, oldest attachment first. `GET /agents/:id/attachments` and the
 * `agent_attachments` event carry it.
 */
export const AgentAttachmentsSchema = z.strictObject({
  agent_id: IdSchema,
  integration_ids: z.array(IdSchema),
  plugin_ids: z.array(IdSchema),
});

/** The integrations and plugins attached to an agent. */
export type AgentAttachments = z.infer<typeof AgentAttachmentsSchema>;

/** A department: one manager and its interns. */
export const DepartmentSchema = z.strictObject({
  id: IdSchema,
  name: RoleNameSchema,
  manager_agent_id: IdSchema.nullable(),
  member_count: z.number().int().min(0),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A department as the API returns it. */
export type Department = z.infer<typeof DepartmentSchema>;

/** Where a task is in its life. */
export const TaskStatusSchema = z.enum([
  'queued',
  'in_progress',
  'blocked',
  'awaiting_approval',
  'done',
  'failed',
  'cancelled',
]);

/** A task status. */
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** The statuses of a task that is not finished yet. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  'queued',
  'in_progress',
  'blocked',
  'awaiting_approval',
];

/**
 * A unit of work for one agent. `delegator_agent_id` is null when the owner assigned it, and
 * `parent_task_id` points at the task a manager delegated it from. `status_reason` says why a task
 * is blocked or awaiting approval. A task on a repository names it, and an intern's task gets its
 * feature branch when the intern checks the repository out.
 */
export const TaskSchema = z.strictObject({
  id: IdSchema,
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(20_000),
  assignee_agent_id: IdSchema,
  delegator_agent_id: IdSchema.nullable(),
  parent_task_id: IdSchema.nullable(),
  repository_id: IdSchema.nullable(),
  feature_branch: z.string().nullable(),
  status: TaskStatusSchema,
  status_reason: z.string().nullable(),
  result: z.string().nullable(),
  report_id: IdSchema.nullable(),
  started_at: DateTimeSchema.nullable(),
  finished_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A task as the API returns it. */
export type Task = z.infer<typeof TaskSchema>;

/** Body of `POST /tasks`. */
export const CreateTaskSchema = TaskSchema.pick({
  title: true,
  instructions: true,
  assignee_agent_id: true,
  repository_id: true,
}).partial({ repository_id: true });

/** Body of `POST /tasks`. */
export type CreateTask = z.infer<typeof CreateTaskSchema>;

/** Query of `GET /tasks`. */
export const TaskListQuerySchema = z.strictObject({
  status: TaskStatusSchema.optional(),
  agent_id: IdSchema.optional(),
  parent_task_id: IdSchema.optional(),
});

/** Query of `GET /tasks`. */
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

/** The Markdown report of a finished task. */
export const ReportSchema = z.strictObject({
  id: IdSchema,
  task_id: IdSchema,
  agent_id: IdSchema,
  body_md: z.string(),
  created_at: DateTimeSchema,
});

/** A report as the API returns it. */
export type Report = z.infer<typeof ReportSchema>;

/** Query of `GET /reports`. */
export const ReportListQuerySchema = z.strictObject({
  agent_id: IdSchema.optional(),
});

/** Query of `GET /reports`. */
export type ReportListQuery = z.infer<typeof ReportListQuerySchema>;
