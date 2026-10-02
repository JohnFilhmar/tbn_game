import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** Where a run is in its life. */
export const RunStatusSchema = z.enum(['running', 'done', 'failed', 'cancelled']);

/** A run status. */
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** One execution of an agent on a task, or on an owner message when the agent was idle. */
export const RunSchema = z.strictObject({
  id: IdSchema,
  agent_id: IdSchema,
  task_id: IdSchema.nullable(),
  status: RunStatusSchema,
  turn_count: z.number().int().min(0),
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
