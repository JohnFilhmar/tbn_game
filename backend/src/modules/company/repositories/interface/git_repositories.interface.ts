import type { BranchReviewListQuery, MergeRequestListQuery } from '@tbn/contracts';
import type {
  BranchReviewRecord,
  BranchReviewWrite,
  MergeRequestRecord,
  MergeRequestWrite,
  RepositoryRecord,
  RepositoryWrite,
} from '@/modules/company/types/git_records';

/** Injection token for `RepositoryRepository`. */
export const REPOSITORY_REPOSITORY = Symbol('REPOSITORY_REPOSITORY');

/** Injection token for `MergeRequestRepository`. */
export const MERGE_REQUEST_REPOSITORY = Symbol('MERGE_REQUEST_REPOSITORY');

/** Injection token for `BranchReviewRepository`. */
export const BRANCH_REVIEW_REPOSITORY = Symbol('BRANCH_REVIEW_REPOSITORY');

/** Repository rows, scoped by owner. */
export interface RepositoryRepository {
  list(owner_id: string): Promise<RepositoryRecord[]>;
  find(owner_id: string, id: string): Promise<RepositoryRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<RepositoryRecord | null>;
  create(owner_id: string, write: RepositoryWrite): Promise<RepositoryRecord>;
  /** True when a row was deleted. */
  delete(owner_id: string, id: string): Promise<boolean>;
}

/** Merge request rows, scoped by owner. */
export interface MergeRequestRepository {
  list(owner_id: string, query: MergeRequestListQuery): Promise<MergeRequestRecord[]>;
  find(owner_id: string, id: string): Promise<MergeRequestRecord | null>;
  /** The open merge request from a branch of a repository, when there is one. */
  find_open(
    owner_id: string,
    repository_id: string,
    source_branch: string,
  ): Promise<MergeRequestRecord | null>;
  create(owner_id: string, write: MergeRequestWrite): Promise<MergeRequestRecord>;
  /** Marks an open merge request merged. Null when it was not open. */
  mark_merged(owner_id: string, id: string, merge_sha: string): Promise<MergeRequestRecord | null>;
  /** Closes an open merge request. Null when it was not open. */
  close(owner_id: string, id: string): Promise<MergeRequestRecord | null>;
}

/** Branch review rows, scoped by owner. */
export interface BranchReviewRepository {
  list(owner_id: string, query: BranchReviewListQuery): Promise<BranchReviewRecord[]>;
  find(owner_id: string, id: string): Promise<BranchReviewRecord | null>;
  /** The newest review of a branch, when there is one. */
  latest(
    owner_id: string,
    repository_id: string,
    branch: string,
  ): Promise<BranchReviewRecord | null>;
  create(owner_id: string, write: BranchReviewWrite): Promise<BranchReviewRecord>;
}
