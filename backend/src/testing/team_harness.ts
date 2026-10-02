import type { INestApplicationContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  AgentSchema,
  ProviderSchema,
  RunSchema,
  TaskSchema,
  TranscriptEntrySchema,
  type Agent,
  type ApiFormat,
  type CreateProvider,
  type Provider,
  type RecruitAgent,
  type Run,
  type Task,
  type TranscriptEntry,
} from '@tbn/contracts';
import request from 'supertest';
import type { AppConfig } from '@/config/config.schema';
import { start_fake_provider_server, type FakeProviderServer } from './fake_provider_server';
import { create_test_web_app, load_test_config } from './test_app';
import { recruit_test_agent, TEST_INTERN_MODEL, TEST_PRIMARY_MODEL } from './test_company';
import { create_test_owner, type TestOwner } from './test_owner';
import { reset_worker_state, start_test_worker } from './test_worker';
import { wait_for } from './wait_for';

/** A web app, an in-process worker, an owner and helpers to drive a team over HTTP. */
export interface TeamHarness {
  config: AppConfig;
  app: NestExpressApplication;
  worker: INestApplicationContext;
  owner: TestOwner;
  api(): ReturnType<typeof request>;
  /** Starts a fake provider server that is closed with the harness. */
  fake(api_format: ApiFormat): Promise<FakeProviderServer>;
  /** Adds a provider on a fake server with the two test models. */
  provider(fake: FakeProviderServer, overrides?: Partial<CreateProvider>): Promise<Provider>;
  /** Recruits a manager on a provider. */
  manager(provider: Provider, overrides?: Partial<RecruitAgent>): Promise<Agent>;
  assign(agent: Agent, title: string, instructions?: string): Promise<Task>;
  task(id: string): Promise<Task>;
  tasks(query: Record<string, string>): Promise<Task[]>;
  agent(id: string): Promise<Agent>;
  agents(query: Record<string, string>): Promise<Agent[]>;
  runs(agent_id: string): Promise<Run[]>;
  transcript(agent_id: string): Promise<TranscriptEntry[]>;
  wait_for_task(id: string, status: Task['status'], timeout_ms?: number): Promise<Task>;
  /**
   * Polls the agent's newest run until it is paused for `pause_reason`. An approval row appears
   * before the loop pauses the run, so a test that saw the approval waits here before it reads
   * the run.
   */
  wait_for_pause(
    agent_id: string,
    pause_reason: NonNullable<Run['pause_reason']>,
    timeout_ms?: number,
  ): Promise<Run>;
  close(): Promise<void>;
}

/**
 * Starts the harness. Test files share the database and the queue, so it clears wakes left
 * behind by earlier files before the worker starts.
 */
export async function start_team_harness(
  adjust: (config: AppConfig) => AppConfig = (config) => config,
): Promise<TeamHarness> {
  const base = load_test_config();
  const config = adjust({
    ...base,
    providers: { ...base.providers, timeout_ms: 20_000, max_attempts: 1 },
    worker: { ...base.worker, concurrency: 4, run_lease_seconds: 10 },
  });
  const app = await create_test_web_app(config);
  await reset_worker_state(app);
  const worker = await start_test_worker(config);
  const owner = await create_test_owner(app);
  const servers: FakeProviderServer[] = [];
  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const auth = { Authorization: `Bearer ${owner.token}` };

  const harness: TeamHarness = {
    config,
    app,
    worker,
    owner,
    api,
    fake: async (api_format) => {
      const server = await start_fake_provider_server(api_format);
      servers.push(server);
      return server;
    },
    provider: async (fake, overrides = {}) => {
      const response = await api()
        .post('/providers')
        .set(auth)
        .send({
          name: `provider_${servers.indexOf(fake)}_${Date.now()}`,
          api_format: fake.api_format,
          base_url: fake.base_url,
          api_key: 'sk-test-team',
          models: [
            { model_id: TEST_PRIMARY_MODEL, cost_tier: 'premium' },
            { model_id: TEST_INTERN_MODEL, cost_tier: 'cheap' },
          ],
          ...overrides,
        })
        .expect(201);
      return ProviderSchema.parse(response.body);
    },
    manager: (provider, overrides = {}) =>
      recruit_test_agent(app, owner.owner_id, provider.id, overrides),
    assign: async (agent, title, instructions = 'Do the work and report.') => {
      const response = await api()
        .post('/tasks')
        .set(auth)
        .send({ title, instructions, assignee_agent_id: agent.id })
        .expect(201);
      return TaskSchema.parse(response.body);
    },
    task: async (id) =>
      TaskSchema.parse((await api().get(`/tasks/${id}`).set(auth).expect(200)).body),
    tasks: async (query) =>
      TaskSchema.array().parse((await api().get('/tasks').query(query).set(auth).expect(200)).body),
    agent: async (id) =>
      AgentSchema.parse((await api().get(`/agents/${id}`).set(auth).expect(200)).body),
    agents: async (query) =>
      AgentSchema.array().parse(
        (await api().get('/agents').query(query).set(auth).expect(200)).body,
      ),
    runs: async (agent_id) =>
      RunSchema.array().parse(
        (await api().get('/runs').query({ agent_id }).set(auth).expect(200)).body,
      ),
    transcript: async (agent_id) =>
      TranscriptEntrySchema.array().parse(
        (
          await api()
            .get(`/agents/${agent_id}/transcript`)
            .query({ limit: 500 })
            .set(auth)
            .expect(200)
        ).body,
      ),
    wait_for_task: (id, status, timeout_ms = 30_000) =>
      wait_for(
        `task ${id} to be ${status}`,
        async () => {
          const task = await harness.task(id);
          return task.status === status ? task : undefined;
        },
        { timeout_ms },
      ),
    wait_for_pause: (agent_id, pause_reason, timeout_ms = 30_000) =>
      wait_for(
        `a run of agent ${agent_id} paused for ${pause_reason}`,
        async () => {
          const [run] = await harness.runs(agent_id);
          return run?.status === 'paused' && run.pause_reason === pause_reason ? run : undefined;
        },
        { timeout_ms },
      ),
    close: async () => {
      await worker.close();
      await Promise.all(servers.map((server) => server.close()));
      await app.close();
    },
  };
  return harness;
}
