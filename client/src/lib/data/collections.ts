import {
  AgentSchema,
  ApprovalSchema,
  BranchReviewSchema,
  DepartmentSchema,
  InstructionSchema,
  IntegrationSchema,
  MergeRequestSchema,
  NotificationChannelSchema,
  NotificationSchema,
  PluginSchema,
  ProviderSchema,
  ReportSchema,
  RepositorySchema,
  RunSchema,
  SandboxJobSchema,
  SearchProviderSchema,
  SkillSchema,
  TaskSchema,
  type EventEntity,
} from '@tbn/contracts';
import type { z } from 'zod';

/** A collection the client keeps whole: every row of the owner, loaded once, kept live by events. */
export interface CollectionSpec<Row extends { id: string }> {
  /** The event entity whose changes land in this collection. */
  entity: EventEntity;
  path: string;
  key: readonly ['collection', string];
  schema: z.ZodType<Row[]>;
}

function collection<Row extends { id: string }>(
  entity: EventEntity,
  path: string,
  schema: z.ZodType<Row[]>,
): CollectionSpec<Row> {
  return { entity, path, key: ['collection', path], schema };
}

/** Every collection, by name. Screens filter them in memory. */
export const COLLECTIONS = {
  agents: collection('agent', '/agents', AgentSchema.array()),
  departments: collection('department', '/departments', DepartmentSchema.array()),
  tasks: collection('task', '/tasks', TaskSchema.array()),
  reports: collection('report', '/reports', ReportSchema.array()),
  runs: collection('run', '/runs', RunSchema.array()),
  approvals: collection('approval', '/approvals', ApprovalSchema.array()),
  sandboxJobs: collection('sandbox_job', '/sandbox_jobs', SandboxJobSchema.array()),
  repositories: collection('repository', '/repositories', RepositorySchema.array()),
  mergeRequests: collection('merge_request', '/merge_requests', MergeRequestSchema.array()),
  branchReviews: collection('branch_review', '/branch_reviews', BranchReviewSchema.array()),
  providers: collection('provider', '/providers', ProviderSchema.array()),
  searchProviders: collection('search_provider', '/search_providers', SearchProviderSchema.array()),
  integrations: collection('integration', '/integrations', IntegrationSchema.array()),
  plugins: collection('plugin', '/plugins', PluginSchema.array()),
  notificationChannels: collection(
    'notification_channel',
    '/notification_channels',
    NotificationChannelSchema.array(),
  ),
  notifications: collection('notification', '/notifications', NotificationSchema.array()),
  instructions: collection('instruction', '/instructions', InstructionSchema.array()),
  skills: collection('skill', '/skills', SkillSchema.array()),
};

/** The query key of the collection an event entity's changes land in, if it has one. */
export function collectionKeyOf(entity: EventEntity): readonly unknown[] | undefined {
  return Object.values(COLLECTIONS).find((spec) => spec.entity === entity)?.key;
}

/** Query keys of the data that is not a collection. */
export const queryKeys = {
  transcript: (agentId: string) => ['transcript', agentId] as const,
  runSources: (runId: string) => ['runSources', runId] as const,
  capWindows: (providerId: string) => ['capWindows', providerId] as const,
  agentAttachments: (agentId: string) => ['agentAttachments', agentId] as const,
  preferences: () => ['preferences'] as const,
  usage: (providerId: string) => ['usage', providerId] as const,
  cacheStats: () => ['cacheStats'] as const,
  notificationEvents: () => ['notificationEvents'] as const,
  me: () => ['me'] as const,
};
