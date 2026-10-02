import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** A repository name, which names its directory on the workspace volume. */
export const RepositoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters, digits, underscores and dashes');

/** A git branch name the runtime accepts: no `..`, no `@{`, no control characters, no `.lock`. */
export const BranchNameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'letters, digits, dots, dashes, underscores and slashes')
  .refine(
    (value) =>
      !value.includes('..') &&
      !value.includes('//') &&
      !value.endsWith('/') &&
      !value.endsWith('.') &&
      !value.endsWith('.lock') &&
      !value.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock')),
    'not a valid branch name',
  );

/** A branch name. */
export type BranchName = z.infer<typeof BranchNameSchema>;

/** The branches no agent can write: the default branch, `development` and `staging`. */
export const PROTECTED_BRANCHES: readonly string[] = ['development', 'staging'];

/**
 * A repository the owner registered. Agents work in local clones of it on the server; the
 * optional remote is public and only ever fetched.
 */
export const RepositorySchema = z.strictObject({
  id: IdSchema,
  name: RepositoryNameSchema,
  remote_url: z.url({ protocol: /^https?$/ }).nullable(),
  default_branch: BranchNameSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A repository as the API returns it. */
export type Repository = z.infer<typeof RepositorySchema>;

/** Body of `POST /repositories`. Without a remote an empty repository is created. */
export const CreateRepositorySchema = RepositorySchema.pick({
  name: true,
  remote_url: true,
  default_branch: true,
}).partial({ remote_url: true, default_branch: true });

/** Body of `POST /repositories`. */
export type CreateRepository = z.infer<typeof CreateRepositorySchema>;

/** Where a merge request is. */
export const MergeRequestStatusSchema = z.enum(['open', 'merged', 'closed']);

/** A merge request status. */
export type MergeRequestStatus = z.infer<typeof MergeRequestStatusSchema>;

/**
 * A manager's request to merge its branch into `development`. A record in this system with the
 * diff, the review notes and the test output; only the owner merges it.
 */
export const MergeRequestSchema = z.strictObject({
  id: IdSchema,
  repository_id: IdSchema,
  agent_id: IdSchema,
  source_branch: BranchNameSchema,
  target_branch: BranchNameSchema,
  status: MergeRequestStatusSchema,
  head_sha: z.string().min(1),
  diff: z.string(),
  log: z.string(),
  review_notes: z.string(),
  test_output: z.string().nullable(),
  test_job_id: IdSchema.nullable(),
  merge_sha: z.string().nullable(),
  created_at: DateTimeSchema,
  merged_at: DateTimeSchema.nullable(),
  closed_at: DateTimeSchema.nullable(),
});

/** A merge request as the API returns it. */
export type MergeRequest = z.infer<typeof MergeRequestSchema>;

/** Query of `GET /merge_requests`. */
export const MergeRequestListQuerySchema = z.strictObject({
  status: MergeRequestStatusSchema.optional(),
  repository_id: IdSchema.optional(),
});

/** Query of `GET /merge_requests`. */
export type MergeRequestListQuery = z.infer<typeof MergeRequestListQuerySchema>;

/** A manager's verdict on an intern's branch. */
export const ReviewVerdictSchema = z.enum(['approve', 'request_changes']);

/** `approve` or `request_changes`. */
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

/** A manager's review of a feature branch at one commit, with its findings and the test it ran. */
export const BranchReviewSchema = z.strictObject({
  id: IdSchema,
  repository_id: IdSchema,
  reviewer_agent_id: IdSchema,
  branch: BranchNameSchema,
  head_sha: z.string().min(1),
  findings: z.string(),
  verdict: ReviewVerdictSchema,
  test_job_id: IdSchema.nullable(),
  created_at: DateTimeSchema,
});

/** A branch review as the API returns it. */
export type BranchReview = z.infer<typeof BranchReviewSchema>;

/** Query of `GET /branch_reviews`. */
export const BranchReviewListQuerySchema = z.strictObject({
  repository_id: IdSchema.optional(),
  branch: BranchNameSchema.optional(),
});

/** Query of `GET /branch_reviews`. */
export type BranchReviewListQuery = z.infer<typeof BranchReviewListQuerySchema>;
