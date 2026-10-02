import type { NestExpressApplication } from '@nestjs/platform-express';
import { RunSchema, TranscriptEntrySchema, type Agent } from '@tbn/contracts';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

describe('transcript and run routes', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let agent: Agent;

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent = await recruit_test_agent(app, owner.owner_id, provider.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get(`/agents/${agent.id}/transcript`).expect(401);
    await api().post(`/agents/${agent.id}/messages`).send({ text: 'hi' }).expect(401);
    await api().get('/runs').expect(401);
  });

  it('appends owner messages, wakes the agent and pages the transcript', async () => {
    const first = await api()
      .post(`/agents/${agent.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'First' })
      .expect(201);
    expect(TranscriptEntrySchema.parse(first.body)).toMatchObject({
      kind: 'owner_message',
      seq: 1,
      run_id: null,
      content: { text: 'First' },
    });
    await api()
      .post(`/agents/${agent.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Second' })
      .expect(201);

    const wakes = await app.get(PrismaService).$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM pgboss.job
      WHERE name = 'agent_wake' AND data->>'agent_id' = ${agent.id}`;
    expect(Number(wakes[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);

    const all = await api()
      .get(`/agents/${agent.id}/transcript`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      TranscriptEntrySchema.array()
        .parse(all.body)
        .map((entry) => entry.seq),
    ).toEqual([1, 2]);

    const paged = await api()
      .get(`/agents/${agent.id}/transcript`)
      .query({ after_seq: 1, limit: 1 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      TranscriptEntrySchema.array()
        .parse(paged.body)
        .map((entry) => entry.seq),
    ).toEqual([2]);
  });

  it('rejects an empty message, a bad query, a foreign agent and a dismissed agent', async () => {
    await api()
      .post(`/agents/${agent.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: '   ' })
      .expect(400);
    await api()
      .get(`/agents/${agent.id}/transcript`)
      .query({ limit: 0 })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);

    const other = await create_test_owner(app);
    await api()
      .get(`/agents/${agent.id}/transcript`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    const dismissed = await recruit_test_agent(app, owner.owner_id, provider.id);
    await api()
      .post(`/agents/${dismissed.id}/dismiss`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await api()
      .post(`/agents/${dismissed.id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Are you there?' })
      .expect(409);
  });

  it('lists runs and answers 404 for an unknown one', async () => {
    const listed = await api()
      .get('/runs')
      .query({ agent_id: agent.id })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(RunSchema.array().parse(listed.body)).toEqual([]);
    await api()
      .get(`/runs/${owner.owner_id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await api()
      .get('/runs')
      .query({ status: 'sleeping' })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
  });
});
