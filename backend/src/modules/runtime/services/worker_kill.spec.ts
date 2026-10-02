import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ReportSchema, RunSchema, TaskSchema, TranscriptEntrySchema } from '@tbn/contracts';
import request from 'supertest';
import type { AppConfig } from '@/config/config.schema';
import {
  start_fake_provider_server,
  type FakeProviderServer,
} from '@/testing/fake_provider_server';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  reset_worker_state,
  start_worker_process,
  type WorkerProcess,
} from '@/testing/test_worker';
import { wait_for } from '@/testing/wait_for';

const LEASE_SECONDS = '10';

describe('a worker killed mid-run', () => {
  let config: AppConfig;
  let app: NestExpressApplication;
  let owner: TestOwner;
  let fake: FakeProviderServer;
  let worker: WorkerProcess | undefined;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    config = {
      ...load_test_config(),
      worker: { ...load_test_config().worker, run_lease_seconds: 10 },
    };
    app = await create_test_web_app(config);
    await reset_worker_state(app);
    owner = await create_test_owner(app);
    fake = await start_fake_provider_server('anthropic_messages');
  });

  afterAll(async () => {
    if (worker !== undefined) await worker.stop('SIGKILL');
    await fake.close();
    await app.close();
  });

  it('resumes from its checkpoint on the next worker and loses nothing', async () => {
    const provider = await create_test_provider(
      app,
      owner.owner_id,
      'anthropic_messages',
      fake.base_url,
    );
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    fake.enqueue({
      type: 'tool_use',
      name: 'write_file',
      input: { path: 'draft.md', content: 'First draft\n' },
    });
    fake.enqueue({ type: 'hold' });
    fake.enqueue({
      type: 'tool_use',
      name: 'finish_task',
      input: {
        outcome: 'Draft saved.',
        what_was_done: 'Wrote draft.md',
        decisions: '',
        open_questions: '',
      },
    });

    worker = await start_worker_process({
      RUN_LEASE_SECONDS: LEASE_SECONDS,
      PROVIDER_TIMEOUT_MS: '60000',
    });
    const created = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Survive a kill',
        instructions: 'Write a draft.',
        assignee_agent_id: agent.id,
      })
      .expect(201);
    const task = TaskSchema.parse(created.body);

    await wait_for(
      'the second model call to be in flight',
      () => (fake.requests.length >= 2 ? true : undefined),
      {
        timeout_ms: 30_000,
      },
    );
    const killed_at = Date.now();
    expect(await worker.stop('SIGKILL')).toBe('SIGKILL');
    fake.release();

    worker = await start_worker_process({
      RUN_LEASE_SECONDS: LEASE_SECONDS,
      PROVIDER_TIMEOUT_MS: '60000',
    });
    const done = await wait_for(
      'the task to finish on the new worker',
      async () => {
        const response = await api()
          .get(`/tasks/${task.id}`)
          .set('Authorization', `Bearer ${owner.token}`);
        const current = TaskSchema.parse(response.body);
        return current.status === 'done' ? current : undefined;
      },
      { timeout_ms: 60_000, interval_ms: 500 },
    );
    expect(Date.now() - killed_at).toBeLessThan(60_000);
    expect(done.result).toBe('Draft saved.');

    const entries = TranscriptEntrySchema.array().parse(
      (
        await api()
          .get(`/agents/${agent.id}/transcript`)
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(200)
      ).body,
    );
    expect(entries.map((entry) => entry.kind)).toEqual([
      'task_assignment',
      'assistant',
      'tool_result',
      'assistant',
      'tool_result',
    ]);
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests[2]?.body).toEqual(fake.requests[1]?.body);

    const file = await readFile(
      join(config.workspace.dir, 'owners', owner.owner_id, 'draft.md'),
      'utf8',
    );
    expect(file).toBe('First draft\n');
    const reports = ReportSchema.array().parse(
      (
        await api()
          .get('/reports')
          .query({ agent_id: agent.id })
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(200)
      ).body,
    );
    expect(reports).toHaveLength(1);
    const runs = RunSchema.array().parse(
      (
        await api()
          .get('/runs')
          .query({ agent_id: agent.id })
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(200)
      ).body,
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'done', turn_count: 2 });

    expect(await worker.stop('SIGTERM')).toBe(0);
    worker = undefined;
  });
});
