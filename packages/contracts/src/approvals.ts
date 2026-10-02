import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { RunSourceSchema } from './runs';

/** What waits in the inbox: a tool call the owner must allow, or the runaway guard's question. */
export const ApprovalKindSchema = z.enum(['tool_call', 'runaway_guard']);

/** `tool_call` or `runaway_guard`. */
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;

/** Where an approval is. */
export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'denied']);

/** An approval status. */
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * One question for the owner. `payload` is the exact tool input, `preview` the request an
 * integration would send with its token redacted, and `sources` what the run had read when it
 * asked.
 */
export const ApprovalSchema = z.strictObject({
  id: IdSchema,
  run_id: IdSchema,
  agent_id: IdSchema,
  task_id: IdSchema.nullable(),
  kind: ApprovalKindSchema,
  tool_name: z.string().nullable(),
  tool_use_id: z.string().nullable(),
  payload: z.json(),
  preview: z.string().nullable(),
  sources: z.array(RunSourceSchema.pick({ kind: true, reference: true, cached: true })),
  status: ApprovalStatusSchema,
  note: z.string().nullable(),
  created_at: DateTimeSchema,
  decided_at: DateTimeSchema.nullable(),
});

/** An approval as the API returns it. */
export type Approval = z.infer<typeof ApprovalSchema>;

/** Body of `POST /approvals/:id/approve` and `/deny`: an optional note the agent reads. */
export const DecideApprovalSchema = z.strictObject({
  note: z.string().trim().min(1).max(2_000).optional(),
});

/** Body of the approval decisions. */
export type DecideApproval = z.infer<typeof DecideApprovalSchema>;

/** Query of `GET /approvals`. */
export const ApprovalListQuerySchema = z.strictObject({
  status: ApprovalStatusSchema.optional(),
  agent_id: IdSchema.optional(),
});

/** Query of `GET /approvals`. */
export type ApprovalListQuery = z.infer<typeof ApprovalListQuerySchema>;
