import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  AgentSchema,
  ReportSchema,
  RunSchema,
  TaskSchema,
  TranscriptEntrySchema,
  type Agent,
  type ApiFormat,
  type RecruitAgent,
  type Task,
  type TranscriptEntry,
} from '@tbn/contracts';
import request from 'supertest';
import { z } from 'zod';
import type { AppConfig } from '@/config/config.schema';
import {
  start_fake_provider_server,
  type FakeProviderServer,
  type RecordedRequest,
} from '@/testing/fake_provider_server';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { reset_worker_state, start_test_worker } from '@/testing/test_worker';
import { wait_for } from '@/testing/wait_for';

const WireSchema = z.looseObject({
  system: z.unknown(),
  tools: z.array(z.looseObject({ name: z.string() })).optional(),
  messages: z.array(z.unknown()),
});

const finish = {
  type: 'tool_use' as const,
  name: 'finish_task',
  input: {
    outcome: 'Wrote the haiku.',
    what_was_done: 'Saved poems/autumn.md',
    decisions: '',
    open_questions: '',
  },
};

/** The whole request body as text, to check what the model was told. */
function request_text(recorded: RecordedRequest | undefined): string {
  return recorded === undefined ? '' : JSON.stringify(recorded.body);
}

describe('run loop', () => {
  let config: AppConfig;
  let app: NestExpressApplication;
  let worker: INestApplicationContext;
  let owner: TestOwner;
  const servers: FakeProviderServer[] = [];

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  async function agent_on(
    api_format: ApiFormat,
    overrides: Partial<RecruitAgent> = {},
  ): Promise<{ fake: FakeProviderServer; agent: Agent }> {
    const fake = await start_fake_provider_server(api_format);
    servers.push(fake);
    const provider = await create_test_provider(app, owner.owner_id, api_format, fake.base_url);
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id, overrides);
    return { fake, agent };
  }

  async function assign(agent: Agent, title: string): Promise<Task> {
    const response = await api()
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title,
        instructions: 'Write a haiku about autumn and save it.',
        assignee_agent_id: agent.id,
      })
      .expect(201);
    return TaskSchema.parse(response.body);
  }

  async function wait_for_task(id: string, status: Task['status']): Promise<Task> {
    return wait_for(
      `task ${id} to be ${status}`,
      async () => {
        const response = await api()
          .get(`/tasks/${id}`)
          .set('Authorization', `Bearer ${owner.token}`);
        const task = TaskSchema.parse(response.body);
        return task.status === status ? task : undefined;
      },
      { timeout_ms: 30_000 },
    );
  }

  async function transcript_of(agent: Agent): Promise<TranscriptEntry[]> {
    const response = await api()
      .get(`/agents/${agent.id}/transcript`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    return TranscriptEntrySchema.array().parse(response.body);
  }

  async function agent_now(agent: Agent): Promise<Agent> {
    const response = await api()
      .get(`/agents/${agent.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    return AgentSchema.parse(response.body);
  }

  beforeAll(async () => {
    const base = load_test_config();
    config = {
      ...base,
      providers: { ...base.providers, timeout_ms: 20_000, max_attempts: 2 },
      worker: { ...base.worker, concurrency: 2, run_lease_seconds: 10 },
    };
    app = await create_test_web_app(config);
    await reset_worker_state(app);
    worker = await start_test_worker(config);
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await worker.close();
    await Promise.all(servers.map((server) => server.close()));
    await app.close();
  });

  it('runs a task on an Anthropic provider: writes the file, finishes, reports', async () => {
    const { fake, agent } = await agent_on('anthropic_messages');
    fake.enqueue({
      type: 'tool_use',
      name: 'write_file',
      input: { path: 'poems/autumn.md', content: 'Leaves fall\n' },
      text: 'Writing it down.',
    });
    fake.enqueue(finish);

    const task = await assign(agent, 'Write a haiku');
    const done = await wait_for_task(task.id, 'done');
    expect(done.result).toBe('Wrote the haiku.');
    expect(done.report_id).not.toBeNull();

    const report = ReportSchema.parse(
      (
        await api()
          .get(`/reports/${done.report_id ?? ''}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(200)
      ).body,
    );
    expect(report.body_md).toContain('# Write a haiku');
    expect(report.body_md).toContain('## Outcome\n\nWrote the haiku.');
    expect(report.body_md).toContain('- Requests: 2');

    const file = await readFile(
      join(config.workspace.dir, 'owners', owner.owner_id, 'poems/autumn.md'),
      'utf8',
    );
    expect(file).toBe('Leaves fall\n');

    expect((await transcript_of(agent)).map((entry) => entry.kind)).toEqual([
      'task_assignment',
      'assistant',
      'tool_result',
      'assistant',
      'tool_result',
    ]);
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
    expect(runs[0]).toMatchObject({ status: 'done', turn_count: 2, task_id: task.id, error: null });
    expect(await agent_now(agent)).toMatchObject({ status: 'idle', active_run_id: null });

    const first = WireSchema.parse(fake.requests[0]?.body);
    expect(JSON.stringify(first.system)).toContain('Who you are');
    expect(first.tools?.map((tool) => tool.name)).toEqual([
      'list_files',
      'read_file',
      'write_file',
      'load_skill',
      'search_library',
      'web_search',
      'fetch_url',
      'list_roster',
      'send_message',
      'delegate_task',
      'finish_task',
      'run_command',
      'git_checkout',
      'git_publish',
      'git_diff',
      'git_log',
      'review_branch',
      'merge_feature_branch',
      'open_merge_request',
    ]);
  });

  it('runs a task on an OpenAI provider and builds the report from the last text when finish_task never comes', async () => {
    const { fake, agent } = await agent_on('openai_chat_completions');
    fake.enqueue({ type: 'text', text: 'Here is the haiku.' });
    fake.enqueue({ type: 'text', text: 'Leaves fall softly.' });

    const task = await assign(agent, 'Haiku without a report');
    const done = await wait_for_task(task.id, 'done');

    expect(done.result).toBe('Leaves fall softly.');
    const report = ReportSchema.parse(
      (
        await api()
          .get(`/reports/${done.report_id ?? ''}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(200)
      ).body,
    );
    expect(report.body_md).toContain('did not call finish_task');
    expect((await transcript_of(agent)).map((entry) => entry.kind)).toEqual([
      'task_assignment',
      'assistant',
      'system_note',
      'assistant',
    ]);
    expect(fake.requests).toHaveLength(2);
  });

  it('hides denied tools, refuses ask tools and paths outside the workspace', async () => {
    const { fake, agent } = await agent_on('anthropic_messages', {
      tool_policy: { write_file: 'deny', read_file: 'ask' },
    });
    fake.enqueue({ type: 'tool_use', name: 'read_file', input: { path: 'notes.md' } });
    fake.enqueue({ type: 'tool_use', name: 'list_files', input: { path: '../../etc' } });
    fake.enqueue({ type: 'tool_use', name: 'write_file', input: { path: 'x.md', content: 'x' } });
    fake.enqueue(finish);

    const task = await assign(agent, 'Policies');
    await wait_for_task(task.id, 'done');

    const results = (await transcript_of(agent))
      .filter((entry) => entry.kind === 'tool_result')
      .flatMap((entry) => entry.content.results);
    expect(results.map((result) => [result.name, result.is_error])).toEqual([
      ['read_file', true],
      ['list_files', true],
      ['write_file', true],
      ['finish_task', false],
    ]);
    expect(results[0]?.content).toContain('approval');
    expect(results[1]?.content).toContain('leaves the workspace');
    expect(results[2]?.content).toContain('not permitted');
    const tools = WireSchema.parse(fake.requests[0]?.body).tools?.map((tool) => tool.name);
    expect(tools).not.toContain('write_file');
    expect(tools).toContain('read_file');
  });

  it('answers an owner message to an idle agent in a run without a task', async () => {
    const { fake, agent } = await agent_on('anthropic_messages');
    fake.enqueue({ type: 'text', text: 'Hello owner, all quiet here.' });

    const sent = await api()
      .post(`/agents/${agent.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Anything to report?' })
      .expect(201);
    expect(TranscriptEntrySchema.parse(sent.body)).toMatchObject({ kind: 'owner_message', seq: 1 });

    const entries = await wait_for('the agent to answer', async () => {
      const current = await transcript_of(agent);
      return current.some((entry) => entry.kind === 'assistant') ? current : undefined;
    });
    expect(entries.map((entry) => entry.kind)).toEqual(['owner_message', 'assistant']);
    const run = await wait_for('the chat run to finish', async () => {
      const runs = RunSchema.array().parse(
        (
          await api()
            .get('/runs')
            .query({ agent_id: agent.id })
            .set('Authorization', `Bearer ${owner.token}`)
        ).body,
      );
      return runs[0]?.status === 'done' ? runs[0] : undefined;
    });
    expect(run.task_id).toBeNull();
    expect(await agent_now(agent)).toMatchObject({ status: 'idle' });
  });

  it('reads a message sent to a working agent at its next turn', async () => {
    const { fake, agent } = await agent_on('openai_chat_completions');
    fake.enqueue({ type: 'hold' });
    fake.enqueue(finish);

    const task = await assign(agent, 'Interrupted');
    await wait_for('the first model call', () => (fake.requests.length >= 1 ? true : undefined));
    expect(await agent_now(agent)).toMatchObject({ status: 'working' });
    await api()
      .post(`/agents/${agent.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Change of plan: make it about winter.' })
      .expect(201);
    fake.release();

    await wait_for_task(task.id, 'done');
    expect(request_text(fake.requests[1])).toContain('Change of plan: make it about winter.');
    expect(request_text(fake.requests[0])).not.toContain('Change of plan');
  });

  it('stops a run whose task was cancelled', async () => {
    const { fake, agent } = await agent_on('anthropic_messages');
    fake.enqueue({ type: 'hold' });

    const task = await assign(agent, 'Cancelled midway');
    await wait_for('the model call', () => (fake.requests.length >= 1 ? true : undefined));
    await api()
      .post(`/tasks/${task.id}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    fake.release();

    const run = await wait_for('the run to be cancelled', async () => {
      const runs = RunSchema.array().parse(
        (
          await api()
            .get('/runs')
            .query({ agent_id: agent.id })
            .set('Authorization', `Bearer ${owner.token}`)
        ).body,
      );
      return runs[0]?.status === 'cancelled' ? runs[0] : undefined;
    });
    expect(run.error).toContain('cancelled');
    expect(await agent_now(agent)).toMatchObject({ status: 'idle', active_run_id: null });
    expect(fake.requests).toHaveLength(1);
  });

  it('releases a run on shutdown and resumes it on the next worker', async () => {
    const { fake, agent } = await agent_on('anthropic_messages');
    fake.enqueue({ type: 'hold' });
    fake.enqueue(finish);

    const task = await assign(agent, 'Survives a restart');
    await wait_for('the model call', () => (fake.requests.length >= 1 ? true : undefined));
    const closing = worker.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fake.release();
    await closing;

    const run = RunSchema.array().parse(
      (
        await api()
          .get('/runs')
          .query({ agent_id: agent.id })
          .set('Authorization', `Bearer ${owner.token}`)
      ).body,
    )[0];
    expect(run).toMatchObject({ status: 'running', turn_count: 1 });
    expect((await transcript_of(agent)).map((entry) => entry.kind)).toEqual([
      'task_assignment',
      'assistant',
    ]);

    worker = await start_test_worker(config);
    const done = await wait_for_task(task.id, 'done');
    expect(done.result).toBe('Wrote the haiku.');
    expect(fake.requests).toHaveLength(2);
  });
});
