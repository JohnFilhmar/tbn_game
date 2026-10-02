import type { NestExpressApplication } from '@nestjs/platform-express';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  BRANCH_REVIEW_REPOSITORY,
  MERGE_REQUEST_REPOSITORY,
  REPOSITORY_REPOSITORY,
  type BranchReviewRepository,
  type MergeRequestRepository,
  type RepositoryRepository,
} from './interface/git_repositories.interface';

describe('repositories, merge requests and branch reviews', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let repositories: RepositoryRepository;
  let merge_requests: MergeRequestRepository;
  let reviews: BranchReviewRepository;
  let agent_id: string;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    repositories = app.get<RepositoryRepository>(REPOSITORY_REPOSITORY);
    merge_requests = app.get<MergeRequestRepository>(MERGE_REQUEST_REPOSITORY);
    reviews = app.get<BranchReviewRepository>(BRANCH_REVIEW_REPOSITORY);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent_id = (await recruit_test_agent(app, owner.owner_id, provider.id)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps every row within the owner and moves merge requests from open once', async () => {
    const repository = await repositories.create(owner.owner_id, {
      name: 'app',
      remote_url: null,
      default_branch: 'main',
    });
    expect(await repositories.find(owner.owner_id, repository.id)).toMatchObject({ name: 'app' });
    expect(await repositories.find(other.owner_id, repository.id)).toBeNull();
    expect(await repositories.find_by_name(owner.owner_id, 'app')).toMatchObject({
      id: repository.id,
    });
    expect(await repositories.find_by_name(other.owner_id, 'app')).toBeNull();
    expect((await repositories.list(owner.owner_id)).map((row) => row.name)).toEqual(['app']);
    expect(await repositories.list(other.owner_id)).toEqual([]);

    const review = await reviews.create(owner.owner_id, {
      repository_id: repository.id,
      reviewer_agent_id: agent_id,
      branch: 'alice/thing-abc123',
      head_sha: 'a'.repeat(40),
      findings: 'Fine.',
      verdict: 'request_changes',
      test_job_id: null,
    });
    const later = await reviews.create(owner.owner_id, {
      repository_id: repository.id,
      reviewer_agent_id: agent_id,
      branch: 'alice/thing-abc123',
      head_sha: 'b'.repeat(40),
      findings: 'Better.',
      verdict: 'approve',
      test_job_id: null,
    });
    expect((await reviews.latest(owner.owner_id, repository.id, 'alice/thing-abc123'))?.id).toBe(
      later.id,
    );
    expect(await reviews.latest(other.owner_id, repository.id, 'alice/thing-abc123')).toBeNull();
    expect(
      (await reviews.list(owner.owner_id, { branch: 'alice/thing-abc123' })).map((row) => row.id),
    ).toEqual([later.id, review.id]);
    expect(await reviews.list(other.owner_id, {})).toEqual([]);

    const request = await merge_requests.create(owner.owner_id, {
      repository_id: repository.id,
      agent_id,
      source_branch: 'alice/main',
      target_branch: 'development',
      head_sha: 'c'.repeat(40),
      diff: '+hello',
      log: 'abc Add hello',
      review_notes: 'Reviewed.',
      test_output: null,
      test_job_id: null,
    });
    expect(
      await merge_requests.find_open(owner.owner_id, repository.id, 'alice/main'),
    ).toMatchObject({ id: request.id });
    expect(await merge_requests.find_open(other.owner_id, repository.id, 'alice/main')).toBeNull();
    expect(await merge_requests.find(other.owner_id, request.id)).toBeNull();
    expect(
      (await merge_requests.list(owner.owner_id, { status: 'open' })).map((r) => r.id),
    ).toEqual([request.id]);
    expect(await merge_requests.close(other.owner_id, request.id)).toBeNull();
    const merged = await merge_requests.mark_merged(owner.owner_id, request.id, 'd'.repeat(40));
    expect(merged).toMatchObject({ status: 'merged', merge_sha: 'd'.repeat(40) });
    expect(merged?.merged_at).not.toBeNull();
    expect(await merge_requests.mark_merged(owner.owner_id, request.id, 'e'.repeat(40))).toBeNull();
    expect(await merge_requests.close(owner.owner_id, request.id)).toBeNull();
    expect(await merge_requests.find_open(owner.owner_id, repository.id, 'alice/main')).toBeNull();

    expect(await repositories.delete(other.owner_id, repository.id)).toBe(false);
    expect(await repositories.delete(owner.owner_id, repository.id)).toBe(true);
    expect(await merge_requests.find(owner.owner_id, request.id)).toBeNull();
    expect(await reviews.list(owner.owner_id, {})).toEqual([]);
  });
});
