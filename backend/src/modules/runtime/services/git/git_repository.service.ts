import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CreateRepository, MergeRequest, Repository } from '@tbn/contracts';
import {
  GitRecordsService,
  to_merge_request_view,
  to_repository_view,
} from '@/modules/company/services/git_records.service';
import type { GitJobResult } from './git_job.service';
import { GitJobService } from './git_job.service';

/** What a failed job becomes for the owner: a conflict they can act on, or an unavailable launcher. */
function throw_for(result: Exclude<GitJobResult, { outcome: 'done' }>): never {
  if (result.outcome === 'failed') {
    throw new ServiceUnavailableException(`The git job did not complete: ${result.message}`);
  }
  throw new ConflictException(result.message);
}

/**
 * The owner's side of git: registering repositories, which creates or clones the canonical
 * repository through a system job, refreshing them from their remote, and merging merge requests
 * into `development`, the only way that branch ever changes.
 */
@Injectable()
export class GitRepositoryService {
  constructor(
    private readonly records: GitRecordsService,
    private readonly git: GitJobService,
  ) {}

  async list(owner_id: string): Promise<Repository[]> {
    return (await this.records.list_repositories(owner_id)).map(to_repository_view);
  }

  async get(owner_id: string, id: string): Promise<Repository> {
    return to_repository_view(await this.records.require_repository(owner_id, id));
  }

  /**
   * Registers a repository: an empty canonical repository with the default branch and
   * `development`, or a mirror of the public remote fetched through the proxy.
   */
  async register(owner_id: string, input: CreateRepository): Promise<Repository> {
    const record = await this.records.create_repository(owner_id, {
      name: input.name,
      remote_url: input.remote_url ?? null,
      default_branch: input.default_branch ?? 'main',
    });
    await this.git.prepare_repository_dir(owner_id, record);
    const result =
      record.remote_url === null
        ? await this.git.init(owner_id, record)
        : await this.git.clone_remote(owner_id, record);
    if (result.outcome !== 'done') {
      await this.records.delete_repository(owner_id, record.id);
      await this.git.remove_repository_dir(owner_id, record);
      throw_for(result);
    }
    return to_repository_view(record);
  }

  /** Fetches the default branch from the remote again. */
  async fetch(owner_id: string, id: string): Promise<Repository> {
    const record = await this.records.require_repository(owner_id, id);
    if (record.remote_url === null) throw new ConflictException('The repository has no remote');
    const result = await this.git.fetch_remote(owner_id, record);
    if (result.outcome !== 'done') throw_for(result);
    return to_repository_view(record);
  }

  /** Removes the repository and its canonical copy. Agent checkouts stay until their agents go. */
  async delete(owner_id: string, id: string): Promise<void> {
    const record = await this.records.require_repository(owner_id, id);
    await this.records.delete_repository(owner_id, id);
    await this.git.remove_repository_dir(owner_id, record);
  }

  /** The owner merges an open merge request into `development`. */
  async merge(owner_id: string, id: string): Promise<MergeRequest> {
    const request = await this.records.require_merge_request(owner_id, id);
    if (request.status !== 'open')
      throw new ConflictException(`The merge request is ${request.status}`);
    const repository = await this.records.require_repository(owner_id, request.repository_id);
    const result = await this.git.merge_to_development(
      owner_id,
      repository,
      request.source_branch,
      request.head_sha,
    );
    if (result.outcome !== 'done') throw_for(result);
    const merged = await this.records.mark_merge_request_merged(owner_id, id, result.stdout);
    if (merged === null) throw new ConflictException('The merge request is no longer open');
    return to_merge_request_view(merged);
  }

  /** The owner closes an open merge request without merging it. */
  async close(owner_id: string, id: string): Promise<MergeRequest> {
    await this.records.require_merge_request(owner_id, id);
    const closed = await this.records.close_merge_request(owner_id, id);
    if (closed === null) throw new ConflictException('The merge request is not open');
    return to_merge_request_view(closed);
  }
}
