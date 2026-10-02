import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BranchReview,
  BranchReviewListQuery,
  MergeRequest,
  MergeRequestListQuery,
  Repository,
} from '@tbn/contracts';
import {
  BRANCH_REVIEW_REPOSITORY,
  MERGE_REQUEST_REPOSITORY,
  REPOSITORY_REPOSITORY,
  type BranchReviewRepository,
  type MergeRequestRepository,
  type RepositoryRepository,
} from '@/modules/company/repositories/interface/git_repositories.interface';
import type {
  BranchReviewRecord,
  BranchReviewWrite,
  MergeRequestRecord,
  MergeRequestWrite,
  RepositoryRecord,
  RepositoryWrite,
} from '@/modules/company/types/git_records';

/** Maps a repository row to the API shape. */
export function to_repository_view(record: RepositoryRecord): Repository {
  return {
    id: record.id,
    name: record.name,
    remote_url: record.remote_url,
    default_branch: record.default_branch,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Maps a merge request row to the API shape. */
export function to_merge_request_view(record: MergeRequestRecord): MergeRequest {
  return {
    id: record.id,
    repository_id: record.repository_id,
    agent_id: record.agent_id,
    source_branch: record.source_branch,
    target_branch: record.target_branch,
    status: record.status,
    head_sha: record.head_sha,
    diff: record.diff,
    log: record.log,
    review_notes: record.review_notes,
    test_output: record.test_output,
    test_job_id: record.test_job_id,
    merge_sha: record.merge_sha,
    created_at: record.created_at.toISOString(),
    merged_at: record.merged_at?.toISOString() ?? null,
    closed_at: record.closed_at?.toISOString() ?? null,
  };
}

/** Maps a branch review row to the API shape. */
export function to_branch_review_view(record: BranchReviewRecord): BranchReview {
  return {
    id: record.id,
    repository_id: record.repository_id,
    reviewer_agent_id: record.reviewer_agent_id,
    branch: record.branch,
    head_sha: record.head_sha,
    findings: record.findings,
    verdict: record.verdict,
    test_job_id: record.test_job_id,
    created_at: record.created_at.toISOString(),
  };
}

/**
 * The rows of the company's git work: registered repositories, merge requests and branch reviews.
 * The git operations themselves live in the runtime, which calls this for the records. Until
 * the event log of phase 2, these rows are the record.
 */
@Injectable()
export class GitRecordsService {
  constructor(
    @Inject(REPOSITORY_REPOSITORY) private readonly repositories: RepositoryRepository,
    @Inject(MERGE_REQUEST_REPOSITORY) private readonly merge_requests: MergeRequestRepository,
    @Inject(BRANCH_REVIEW_REPOSITORY) private readonly reviews: BranchReviewRepository,
  ) {}

  list_repositories(owner_id: string): Promise<RepositoryRecord[]> {
    return this.repositories.list(owner_id);
  }

  /** @throws NotFoundException when the repository is missing. */
  async require_repository(owner_id: string, id: string): Promise<RepositoryRecord> {
    const record = await this.repositories.find(owner_id, id);
    if (record === null) throw new NotFoundException('Repository not found');
    return record;
  }

  find_repository_by_name(owner_id: string, name: string): Promise<RepositoryRecord | null> {
    return this.repositories.find_by_name(owner_id, name);
  }

  /** @throws ConflictException when the name is taken. */
  async create_repository(owner_id: string, write: RepositoryWrite): Promise<RepositoryRecord> {
    if ((await this.repositories.find_by_name(owner_id, write.name)) !== null) {
      throw new ConflictException('Repository name is taken');
    }
    return this.repositories.create(owner_id, write);
  }

  delete_repository(owner_id: string, id: string): Promise<boolean> {
    return this.repositories.delete(owner_id, id);
  }

  list_merge_requests(
    owner_id: string,
    query: MergeRequestListQuery,
  ): Promise<MergeRequestRecord[]> {
    return this.merge_requests.list(owner_id, query);
  }

  /** @throws NotFoundException when the merge request is missing. */
  async require_merge_request(owner_id: string, id: string): Promise<MergeRequestRecord> {
    const record = await this.merge_requests.find(owner_id, id);
    if (record === null) throw new NotFoundException('Merge request not found');
    return record;
  }

  find_open_merge_request(
    owner_id: string,
    repository_id: string,
    source_branch: string,
  ): Promise<MergeRequestRecord | null> {
    return this.merge_requests.find_open(owner_id, repository_id, source_branch);
  }

  open_merge_request(owner_id: string, write: MergeRequestWrite): Promise<MergeRequestRecord> {
    return this.merge_requests.create(owner_id, write);
  }

  mark_merge_request_merged(
    owner_id: string,
    id: string,
    merge_sha: string,
  ): Promise<MergeRequestRecord | null> {
    return this.merge_requests.mark_merged(owner_id, id, merge_sha);
  }

  close_merge_request(owner_id: string, id: string): Promise<MergeRequestRecord | null> {
    return this.merge_requests.close(owner_id, id);
  }

  list_reviews(owner_id: string, query: BranchReviewListQuery): Promise<BranchReviewRecord[]> {
    return this.reviews.list(owner_id, query);
  }

  /** @throws NotFoundException when the review is missing. */
  async require_review(owner_id: string, id: string): Promise<BranchReviewRecord> {
    const record = await this.reviews.find(owner_id, id);
    if (record === null) throw new NotFoundException('Review not found');
    return record;
  }

  latest_review(
    owner_id: string,
    repository_id: string,
    branch: string,
  ): Promise<BranchReviewRecord | null> {
    return this.reviews.latest(owner_id, repository_id, branch);
  }

  record_review(owner_id: string, write: BranchReviewWrite): Promise<BranchReviewRecord> {
    return this.reviews.create(owner_id, write);
  }
}
