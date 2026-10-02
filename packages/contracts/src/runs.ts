import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { TaskStatusSchema } from './company';

/** Where a run is in its life. A paused run keeps its agent and resumes from its checkpoint. */
export const RunStatusSchema = z.enum(['running', 'paused', 'done', 'failed', 'cancelled']);

/** A run status. */
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** Why a run is paused. */
export const RunPauseReasonSchema = z.enum([
  'waiting_on_subtasks',
  'cap_limit',
  'breaker_open',
  'out_of_credit',
  'runaway_guard',
  'awaiting_approval',
]);

/** Why a run is paused. */
export type RunPauseReason = z.infer<typeof RunPauseReasonSchema>;

/**
 * One execution of an agent on a task, or on an owner message when the agent was idle. A run
 * that read web or plugin content is tainted from `tainted_at` on: its outward tools then need
 * the owner's approval.
 */
export const RunSchema = z.strictObject({
  id: IdSchema,
  agent_id: IdSchema,
  task_id: IdSchema.nullable(),
  status: RunStatusSchema,
  pause_reason: RunPauseReasonSchema.nullable(),
  resume_at: DateTimeSchema.nullable(),
  turn_count: z.number().int().min(0),
  tainted_at: DateTimeSchema.nullable(),
  error: z.string().nullable(),
  started_at: DateTimeSchema,
  finished_at: DateTimeSchema.nullable(),
  updated_at: DateTimeSchema,
});

/** A run as the API returns it. */
export type Run = z.infer<typeof RunSchema>;

/** Query of `GET /runs`. */
export const RunListQuerySchema = z.strictObject({
  agent_id: IdSchema.optional(),
  status: RunStatusSchema.optional(),
});

/** Query of `GET /runs`. */
export type RunListQuery = z.infer<typeof RunListQuerySchema>;

/** Where untrusted content came from: a fetched page, search results, the library or a plugin. */
export const RunSourceKindSchema = z.enum(['fetch', 'search', 'library', 'plugin']);

/** A run source kind. */
export type RunSourceKind = z.infer<typeof RunSourceKindSchema>;

/** Something a run read that taints it: the URL, the query, or the plugin tool. */
export const RunSourceSchema = z.strictObject({
  id: IdSchema,
  run_id: IdSchema,
  kind: RunSourceKindSchema,
  reference: z.string(),
  cached: z.boolean(),
  read_at: DateTimeSchema,
});

/** A run source as the API returns it. */
export type RunSource = z.infer<typeof RunSourceSchema>;

/** Text block the model produced. */
export const AssistantTextBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
});

/** A tool call the model made. */
export const ToolUseBlockSchema = z.strictObject({
  type: z.literal('tool_use'),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.json()),
});

/** A block of an assistant transcript entry. */
export const AssistantBlockSchema = z.discriminatedUnion('type', [
  AssistantTextBlockSchema,
  ToolUseBlockSchema,
]);

/** What a message between agents carries: work handed over, a question, or a finding. */
export const MessageKindSchema = z.enum(['handoff', 'question', 'finding']);

/** `handoff`, `question` or `finding`. */
export type MessageKind = z.infer<typeof MessageKindSchema>;

/** How a delegated task ended. */
export const SubtaskOutcomeSchema = TaskStatusSchema.extract(['done', 'failed', 'cancelled']);

/** How a delegated task ended. */
export type SubtaskOutcome = z.infer<typeof SubtaskOutcomeSchema>;

/** The result of one tool call. */
export const ToolResultSchema = z.strictObject({
  tool_use_id: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  is_error: z.boolean(),
});

/** What each kind of transcript entry carries. */
export const TranscriptContentSchemas = {
  owner_message: z.strictObject({ text: z.string() }),
  task_assignment: z.strictObject({
    task_id: IdSchema,
    title: z.string(),
    instructions: z.string(),
  }),
  assistant: z.strictObject({ blocks: z.array(AssistantBlockSchema) }),
  tool_result: z.strictObject({ results: z.array(ToolResultSchema) }),
  system_note: z.strictObject({ text: z.string() }),
  agent_message: z.strictObject({
    from_agent_id: IdSchema,
    from_name: z.string(),
    kind: MessageKindSchema,
    text: z.string(),
  }),
  subtask_result: z.strictObject({
    task_id: IdSchema,
    title: z.string(),
    assignee_agent_id: IdSchema,
    assignee_name: z.string(),
    status: SubtaskOutcomeSchema,
    result: z.string().nullable(),
    report_id: IdSchema.nullable(),
    report_md: z.string().nullable(),
  }),
  compaction: z.strictObject({
    summary: z.string(),
    through_seq: z.number().int().min(0),
  }),
} as const;

/** A transcript entry as written: its kind and content. */
export const TranscriptEntryWriteSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('owner_message'),
    content: TranscriptContentSchemas.owner_message,
  }),
  z.strictObject({
    kind: z.literal('task_assignment'),
    content: TranscriptContentSchemas.task_assignment,
  }),
  z.strictObject({ kind: z.literal('assistant'), content: TranscriptContentSchemas.assistant }),
  z.strictObject({ kind: z.literal('tool_result'), content: TranscriptContentSchemas.tool_result }),
  z.strictObject({ kind: z.literal('system_note'), content: TranscriptContentSchemas.system_note }),
  z.strictObject({
    kind: z.literal('agent_message'),
    content: TranscriptContentSchemas.agent_message,
  }),
  z.strictObject({
    kind: z.literal('subtask_result'),
    content: TranscriptContentSchemas.subtask_result,
  }),
  z.strictObject({ kind: z.literal('compaction'), content: TranscriptContentSchemas.compaction }),
]);

/** A transcript entry as written. */
export type TranscriptEntryWrite = z.infer<typeof TranscriptEntryWriteSchema>;

const TranscriptEntryBaseSchema = z.strictObject({
  id: IdSchema,
  agent_id: IdSchema,
  run_id: IdSchema.nullable(),
  seq: z.number().int().min(1),
  created_at: DateTimeSchema,
});

/** One entry of an agent's transcript. The transcript is the run checkpoint. */
export const TranscriptEntrySchema = z.discriminatedUnion('kind', [
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('owner_message'),
    content: TranscriptContentSchemas.owner_message,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('task_assignment'),
    content: TranscriptContentSchemas.task_assignment,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('assistant'),
    content: TranscriptContentSchemas.assistant,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('tool_result'),
    content: TranscriptContentSchemas.tool_result,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('system_note'),
    content: TranscriptContentSchemas.system_note,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('agent_message'),
    content: TranscriptContentSchemas.agent_message,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('subtask_result'),
    content: TranscriptContentSchemas.subtask_result,
  }),
  TranscriptEntryBaseSchema.extend({
    kind: z.literal('compaction'),
    content: TranscriptContentSchemas.compaction,
  }),
]);

/** A transcript entry as the API returns it. */
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

/** Query of `GET /agents/:id/transcript`. */
export const TranscriptQuerySchema = z.strictObject({
  after_seq: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Query of `GET /agents/:id/transcript`. */
export type TranscriptQuery = z.infer<typeof TranscriptQuerySchema>;

/** Body of `POST /agents/:id/messages`. */
export const OwnerMessageSchema = z.strictObject({ text: z.string().trim().min(1).max(20_000) });

/** Body of `POST /agents/:id/messages`. */
export type OwnerMessage = z.infer<typeof OwnerMessageSchema>;
