import { randomUUID } from 'node:crypto';
import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  AgentSchema,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  InstructionSchema,
  SessionSchema,
  TaskSchema,
  type Agent,
  type Provider,
} from '@tbn/contracts';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { ErrorBodySchema } from '@/testing/http';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  TEST_INTERN_MODEL,
  TEST_PRIMARY_MODEL,
  create_test_provider,
  recruit_test_agent,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { wait_for } from '@/testing/wait_for';

const REPLAYED = IDEMPOTENT_REPLAYED_HEADER.toLowerCase();

let probe_calls = 0;
let probe_fails_next = false;
let probe_hold: Promise<void> | null = null;

/** A command that counts its runs and can be held or failed, to watch the interceptor. */
@Controller('idempotency_probe')
class ProbeController {
  @Post()
  async run(): Promise<{ call: number }> {
    probe_calls += 1;
    const call = probe_calls;
    if (probe_hold !== null) await probe_hold;
    if (probe_fails_next) {
      probe_fails_next = false;
      throw new InternalServerErrorException('The probe failed');
    }
    return { call };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(): void {
    probe_calls += 1;
  }
}

describe('idempotent commands', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let provider: Provider;
  let agent: Agent;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  function headers(key: string, token = owner.token): Record<string, string> {
    return { Authorization: `Bearer ${token}`, [IDEMPOTENCY_KEY_HEADER]: key };
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config(), { controllers: [ProbeController] });
    owner = await create_test_owner(app);
    provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent = await recruit_test_agent(app, owner.owner_id, provider.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('recruits once when a recruit is sent twice under one key', async () => {
    const key = randomUUID();
    const body = {
      name: `twice_${key.slice(0, 8)}`,
      role: 'Researcher',
      job_description: 'Finds sources.',
      provider_id: provider.id,
      primary_model: TEST_PRIMARY_MODEL,
      intern_model: TEST_INTERN_MODEL,
    };
    const first = await api().post('/agents').set(headers(key)).send(body).expect(201);
    const second = await api().post('/agents').set(headers(key)).send(body).expect(201);
    expect(first.headers[REPLAYED]).toBeUndefined();
    expect(second.headers[REPLAYED]).toBe('true');
    expect(AgentSchema.parse(second.body)).toEqual(AgentSchema.parse(first.body));
    const agents = AgentSchema.array().parse(
      (await api().get('/agents').set(headers(key)).expect(200)).body,
    );
    expect(agents.filter((item) => item.name === body.name)).toHaveLength(1);
  });

  it('assigns once when an assignment is sent twice under one key', async () => {
    const key = randomUUID();
    const body = { title: `Once ${key}`, instructions: 'Only once.', assignee_agent_id: agent.id };
    const first = await api().post('/tasks').set(headers(key)).send(body).expect(201);
    const second = await api().post('/tasks').set(headers(key)).send(body).expect(201);
    expect(second.headers[REPLAYED]).toBe('true');
    expect(TaskSchema.parse(second.body).id).toBe(TaskSchema.parse(first.body).id);
    const tasks = TaskSchema.array().parse(
      (await api().get('/tasks').query({ agent_id: agent.id }).set(headers(key)).expect(200)).body,
    );
    expect(tasks.filter((task) => task.title === body.title)).toHaveLength(1);
  });

  it('matches a retry whatever the order of its fields', async () => {
    const key = randomUUID();
    await api()
      .post('/instructions')
      .set(headers(key))
      .send({ scope: 'global', title: `Order ${key}`, body: 'Be brief.' })
      .expect(201);
    const again = await api()
      .post('/instructions')
      .set(headers(key))
      .send({ body: 'Be brief.', title: `Order ${key}`, scope: 'global' })
      .expect(201);
    expect(again.headers[REPLAYED]).toBe('true');
  });

  it('refuses a key reused for a different request, and a key that is not a UUID', async () => {
    const key = randomUUID();
    const rule = { scope: 'global', title: `Rule ${key}`, body: 'Be brief.' };
    await api().post('/instructions').set(headers(key)).send(rule).expect(201);
    const reused = await api()
      .post('/instructions')
      .set(headers(key))
      .send({ ...rule, body: 'Be long.' })
      .expect(422);
    expect(ErrorBodySchema.parse(reused.body).message).toContain('different request');
    await api().post('/idempotency_probe').set(headers(key)).expect(422);
    await api().post('/idempotency_probe').set(headers('not-a-uuid')).expect(400);
  });

  it('answers 409 while the first request runs, then replays its answer', async () => {
    const key = randomUUID();
    let release = (): void => undefined;
    probe_hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const before = probe_calls;
    const first = api()
      .post('/idempotency_probe')
      .set(headers(key))
      .then((response) => response);
    await wait_for('the first request to run', () => (probe_calls > before ? true : undefined));
    const conflict = await api().post('/idempotency_probe').set(headers(key)).expect(409);
    expect(ErrorBodySchema.parse(conflict.body).message).toContain('still running');
    probe_hold = null;
    release();
    const answered = await first;
    expect(answered.status).toBe(201);
    const replayed = await api().post('/idempotency_probe').set(headers(key)).expect(201);
    expect(replayed.headers[REPLAYED]).toBe('true');
    expect(replayed.body).toEqual(answered.body);
    expect(probe_calls).toBe(before + 1);
  });

  it('lets a command that failed with a server error run again', async () => {
    const key = randomUUID();
    probe_fails_next = true;
    await api().post('/idempotency_probe').set(headers(key)).expect(500);
    const retried = await api().post('/idempotency_probe').set(headers(key)).expect(201);
    expect(retried.headers[REPLAYED]).toBeUndefined();
    const replayed = await api().post('/idempotency_probe').set(headers(key)).expect(201);
    expect(replayed.body).toEqual(retried.body);
  });

  it('replays a client error and an empty answer', async () => {
    const key = randomUUID();
    const missing = { title: 'Nobody', instructions: 'None.', assignee_agent_id: randomUUID() };
    const first = await api().post('/tasks').set(headers(key)).send(missing).expect(404);
    const second = await api().post('/tasks').set(headers(key)).send(missing).expect(404);
    expect(second.headers[REPLAYED]).toBe('true');
    expect(second.body).toEqual(first.body);

    const removal = randomUUID();
    const before = probe_calls;
    await api().delete('/idempotency_probe').set(headers(removal)).expect(204);
    const repeated = await api().delete('/idempotency_probe').set(headers(removal)).expect(204);
    expect(repeated.headers[REPLAYED]).toBe('true');
    expect(repeated.text).toBe('');
    expect(probe_calls).toBe(before + 1);
  });

  it('keeps the keys of each owner apart', async () => {
    const other = await create_test_owner(app);
    const key = randomUUID();
    const rule = { scope: 'global', title: `Shared key ${key}`, body: 'Be brief.' };
    const mine = await api().post('/instructions').set(headers(key)).send(rule).expect(201);
    const theirs = await api()
      .post('/instructions')
      .set(headers(key, other.token))
      .send(rule)
      .expect(201);
    expect(theirs.headers[REPLAYED]).toBeUndefined();
    expect(InstructionSchema.parse(theirs.body).id).not.toBe(InstructionSchema.parse(mine.body).id);
  });

  it('ignores the header on public routes, reads and requests without it', async () => {
    const key = randomUUID();
    const login = { username: owner.username, password: owner.password };
    const first = await api()
      .post('/auth/login')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(login)
      .expect(200);
    const second = await api()
      .post('/auth/login')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(login)
      .expect(200);
    expect(second.headers[REPLAYED]).toBeUndefined();
    expect(SessionSchema.parse(second.body).token).not.toBe(SessionSchema.parse(first.body).token);
    await api().get('/agents').set(headers(key)).expect(200);
    expect(await app.get(PrismaService).command.count({ where: { key } })).toBe(0);

    const before = probe_calls;
    await api()
      .post('/idempotency_probe')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    await api()
      .post('/idempotency_probe')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    expect(probe_calls).toBe(before + 2);
  });
});
