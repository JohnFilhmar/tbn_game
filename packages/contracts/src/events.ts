import { z } from 'zod';
import { ApprovalSchema } from './approvals';
import { CapWindowStatusSchema } from './caps';
import { DateTimeSchema, IdSchema } from './common';
import {
  AgentAttachmentsSchema,
  AgentSchema,
  DepartmentSchema,
  ReportSchema,
  TaskSchema,
} from './company';
import { BranchReviewSchema, MergeRequestSchema, RepositorySchema } from './git';
import { IntegrationSchema, NotificationChannelSchema, NotificationSchema } from './integrations';
import { InstructionSchema, PreferencesSchema, SkillSchema } from './knowledge';
import { PluginSchema } from './plugins';
import { ProviderSchema } from './providers';
import { RunSchema, RunSourceSchema, TranscriptEntrySchema } from './runs';
import { SandboxJobSchema } from './sandbox';
import { SearchProviderSchema } from './search';
import { WorldLayoutSchema } from './world';
import { WorldPropStateSchema } from './world_props';

/** What happened to an entity: it was created, it changed, or it was removed. */
export const EventOpSchema = z.enum(['insert', 'update', 'delete']);

/** An event operation. */
export type EventOp = z.infer<typeof EventOpSchema>;

/** The kinds of entity the event log records, one per view the client caches. */
export const EventEntitySchema = z.enum([
  'agent',
  'agent_attachments',
  'department',
  'task',
  'report',
  'run',
  'run_source',
  'transcript_entry',
  'approval',
  'sandbox_job',
  'repository',
  'merge_request',
  'branch_review',
  'provider',
  'cap_windows',
  'search_provider',
  'integration',
  'plugin',
  'notification_channel',
  'notification',
  'instruction',
  'skill',
  'preferences',
  'world_layout',
  'world_prop_state',
]);

/** An entity kind in the event log. */
export type EventEntity = z.infer<typeof EventEntitySchema>;

/** A position in the owner's event log. 0 is before the first event. */
export const EventSeqSchema = z.number().int().min(0);

function change_event<Entity extends EventEntity, Data extends z.ZodType>(
  entity: Entity,
  data: Data,
) {
  return z.strictObject({
    seq: EventSeqSchema.min(1),
    entity: z.literal(entity),
    id: IdSchema,
    op: EventOpSchema,
    /** The fields an update changed, or null for an insert, a delete or a change of a part. */
    changed: z.array(z.string()).nullable(),
    /** The entity as it is when the event is sent, in its API shape, or null once it is gone. */
    data: data.nullable(),
    at: DateTimeSchema,
  });
}

/**
 * One change from the owner's event log, as the gateway and `GET /events` send it. `data` is the
 * same view the entity's own route returns, so a client writes it straight into its cache. The
 * cap windows of a provider travel together under the provider's id, an agent's attachments under
 * the agent's, and the preferences under the owner's.
 */
export const ChangeEventSchema = z.discriminatedUnion('entity', [
  change_event('agent', AgentSchema),
  change_event('agent_attachments', AgentAttachmentsSchema),
  change_event('department', DepartmentSchema),
  change_event('task', TaskSchema),
  change_event('report', ReportSchema),
  change_event('run', RunSchema),
  change_event('run_source', RunSourceSchema),
  change_event('transcript_entry', TranscriptEntrySchema),
  change_event('approval', ApprovalSchema),
  change_event('sandbox_job', SandboxJobSchema),
  change_event('repository', RepositorySchema),
  change_event('merge_request', MergeRequestSchema),
  change_event('branch_review', BranchReviewSchema),
  change_event('provider', ProviderSchema),
  change_event('cap_windows', z.array(CapWindowStatusSchema)),
  change_event('search_provider', SearchProviderSchema),
  change_event('integration', IntegrationSchema),
  change_event('plugin', PluginSchema),
  change_event('notification_channel', NotificationChannelSchema),
  change_event('notification', NotificationSchema),
  change_event('instruction', InstructionSchema),
  change_event('skill', SkillSchema),
  change_event('preferences', PreferencesSchema),
  change_event('world_layout', WorldLayoutSchema),
  change_event('world_prop_state', WorldPropStateSchema),
]);

/** One change from the event log. */
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

/** Query of `GET /events`: the events after `after`, oldest first. */
export const EventsQuerySchema = z.strictObject({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1_000).default(200),
});

/** Query of `GET /events`. */
export type EventsQuery = z.infer<typeof EventsQuerySchema>;

/** A page of `GET /events`, with the head of the log when it was read. */
export const EventsPageSchema = z.strictObject({
  head_seq: EventSeqSchema,
  events: z.array(ChangeEventSchema),
});

/** A page of `GET /events`. */
export type EventsPage = z.infer<typeof EventsPageSchema>;

/** The names of the Socket.IO messages the gateway sends. Clients send none. */
export const REALTIME_MESSAGES = {
  hello: 'hello',
  changes: 'changes',
  stream: 'stream',
  resync_required: 'resync_required',
} as const;

/**
 * What a client sends in the Socket.IO handshake: its session token and, to resume, the last
 * sequence it applied. Without a cursor it receives only what happens after it connects.
 */
export const RealtimeAuthSchema = z.strictObject({
  token: z.string().min(1).max(512),
  cursor: EventSeqSchema.nullish(),
});

/** The handshake of a client. */
export type RealtimeAuth = z.infer<typeof RealtimeAuthSchema>;

/** Sent once a socket is connected: the head of the log, and the sequence delivery starts after. */
export const RealtimeHelloSchema = z.strictObject({
  head_seq: EventSeqSchema,
  cursor: EventSeqSchema,
});

/** The `hello` message. */
export type RealtimeHello = z.infer<typeof RealtimeHelloSchema>;

/**
 * Sent when the client's cursor is older than the oldest event kept or ahead of the head. The
 * client reloads its state over HTTP; delivery continues after `head_seq`.
 */
export const ResyncRequiredSchema = z.strictObject({
  head_seq: EventSeqSchema,
  oldest_seq: EventSeqSchema,
});

/** The `resync_required` message. */
export type ResyncRequired = z.infer<typeof ResyncRequiredSchema>;

/**
 * A piece of an agent's model output while it is generated. Chunks are never stored or replayed:
 * the finished reply arrives as the agent's next assistant entry after `after_seq`. Every model
 * call has its own `call_id`. A retry within the call starts a new attempt, whose chunks replace
 * those of the failed one, and the last chunk of an attempt is marked `done`. A call that failed
 * for good stores nothing; the call that resumes the run later has the same `after_seq` and a new
 * `call_id`.
 */
export const StreamChunkSchema = z.strictObject({
  agent_id: IdSchema,
  run_id: IdSchema,
  call_id: IdSchema,
  /** The seq of the agent's last transcript entry when the call began; the reply follows it. */
  after_seq: z.number().int().min(0),
  attempt: z.number().int().min(1),
  index: z.number().int().min(0),
  text: z.string(),
  done: z.boolean(),
});

/** The `stream` message. */
export type StreamChunk = z.infer<typeof StreamChunkSchema>;
