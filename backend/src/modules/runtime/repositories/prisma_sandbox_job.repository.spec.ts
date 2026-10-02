import type { NestExpressApplication } from '@nestjs/platform-express';
import type { SandboxJobSpec } from '@tbn/contracts';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  SANDBOX_JOB_REPOSITORY,
  type SandboxJobRepository,
} from './interface/sandbox_job_repository.interface';

const spec: SandboxJobSpec = {
  argv: ['bash', '-lc', 'true'],
  env: {},
  working_dir: '/work',
  mounts: [],
  limits: { cpus: 1, memory_mb: 256, scratch_mb: 64, timeout_seconds: 30, pids: 64 },
  network: 'none',
};

describe('PrismaSandboxJobRepository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let jobs: SandboxJobRepository;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    jobs = app.get<SandboxJobRepository>(SANDBOX_JOB_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, finds and lists jobs within the owner, and marks an open one lost', async () => {
    const created = await jobs.create(owner.owner_id, {
      run_id: null,
      agent_id: null,
      kind: 'system',
      spec,
    });
    expect(created).toMatchObject({ status: 'queued', stdout: '', stderr: '', exit_code: null });
    expect(created.spec).toEqual(spec);

    expect(await jobs.find(owner.owner_id, created.id)).toMatchObject({ id: created.id });
    expect(await jobs.find(other.owner_id, created.id)).toBeNull();
    expect((await jobs.list(owner.owner_id, {})).map((job) => job.id)).toContain(created.id);
    expect(
      (await jobs.list(owner.owner_id, { status: 'done' })).map((job) => job.id),
    ).not.toContain(created.id);
    expect(await jobs.list(other.owner_id, {})).toEqual([]);

    expect(await jobs.mark_lost(other.owner_id, created.id, 'not yours')).toBeNull();
    const lost = await jobs.mark_lost(owner.owner_id, created.id, 'launcher gone');
    expect(lost).toMatchObject({ status: 'lost', error: 'launcher gone' });
    expect(lost?.finished_at).not.toBeNull();
    expect(await jobs.mark_lost(owner.owner_id, created.id, 'again')).toBeNull();
  });
});
