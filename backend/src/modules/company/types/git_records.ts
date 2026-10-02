import type { MergeRequestStatus, ReviewVerdict } from '@tbn/contracts';

/** A repository row. */
export interface RepositoryRecord {
  id: string;
  owner_id: string;
  name: string;
  remote_url: string | null;
  default_branch: string;
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a repository is registered. */
export interface RepositoryWrite {
  name: string;
  remote_url: string | null;
  default_branch: string;
}

/** A merge request row. */
export interface MergeRequestRecord {
  id: string;
  owner_id: string;
  repository_id: string;
  agent_id: string;
  source_branch: string;
  target_branch: string;
  status: MergeRequestStatus;
  head_sha: string;
  diff: string;
  log: string;
  review_notes: string;
  test_output: string | null;
  test_job_id: string | null;
  merge_sha: string | null;
  created_at: Date;
  merged_at: Date | null;
  closed_at: Date | null;
}

/** Fields written when a merge request is opened. */
export interface MergeRequestWrite {
  repository_id: string;
  agent_id: string;
  source_branch: string;
  target_branch: string;
  head_sha: string;
  diff: string;
  log: string;
  review_notes: string;
  test_output: string | null;
  test_job_id: string | null;
}

/** A branch review row. */
export interface BranchReviewRecord {
  id: string;
  owner_id: string;
  repository_id: string;
  reviewer_agent_id: string;
  branch: string;
  head_sha: string;
  findings: string;
  verdict: ReviewVerdict;
  test_job_id: string | null;
  created_at: Date;
}

/** Fields written when a review is recorded. */
export interface BranchReviewWrite {
  repository_id: string;
  reviewer_agent_id: string;
  branch: string;
  head_sha: string;
  findings: string;
  verdict: ReviewVerdict;
  test_job_id: string | null;
}
