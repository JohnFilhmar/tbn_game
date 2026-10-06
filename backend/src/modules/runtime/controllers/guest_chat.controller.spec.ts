import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GuestChatMessageSchema } from '@tbn/contracts';
import request from 'supertest';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import { AgentService } from '@/modules/company/services/agent.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { GuestReplyService } from '@/modules/runtime/services/guest_chat/guest_reply.service';
import {
  start_fake_provider_server,
  type FakeProviderServer,
} from '@/testing/fake_provider_server';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
} from '@/testing/test_company';
import { create_test_guest, type TestGuest } from '@/testing/test_guest';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const RequestBodySchema = z.looseObject({
  messages: z.array(z.looseObject({ role: z.string(), content: z.unknown() })),
});

describe('guest chat', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let fake: FakeProviderServer;
  let provider_id: string;
  let mika: TestGuest;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    fake = await start_fake_provider_server('openai_chat_completions');
    provider_id = (
      await create_test_provider(app, owner.owner_id, 'openai_chat_completions', fake.base_url)
    ).id;
    mika = await create_test_guest(app, owner, 'Mika');
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  const api = () => request(app.getHttpServer());

  function say(guest: TestGuest, agent_id: string, text: string) {
    return api().post(`/agents/${agent_id}/guest_chat`).set('Cookie', guest.cookie).send({ text });
  }

  it('waits until the owner picks a guest model', async () => {
    const agent = await recruit_test_agent(app, owner.owner_id, provider_id);
    const refused = await say(mika, agent.id, 'Hello?').expect(409);
    expect(refused.text).toContain('has not set up guest conversations');
  });

  it('answers a guest on the guest model with no tools, apart from the agent transcript', async () => {
    await api()
      .put('/preferences/guest_model')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ value: { provider_id, model_id: TEST_INTERN_MODEL } })
      .expect(200);
    const agent = await recruit_test_agent(app, owner.owner_id, provider_id, { name: 'ada_guest' });
    fake.enqueue({ type: 'text', text: 'Hi Mika! I am idle right now.' });

    const sent = GuestChatMessageSchema.parse(
      (await say(mika, agent.id, 'What are you up to?').expect(201)).body,
    );
    expect(sent).toMatchObject({ role: 'guest', text: 'What are you up to?' });
    await app.get(GuestReplyService).handle({
      owner_id: owner.owner_id,
      guest_id: mika.guest_id,
      agent_id: agent.id,
    });

    const lines = GuestChatMessageSchema.array().parse(
      (await api().get(`/agents/${agent.id}/guest_chat`).set('Cookie', mika.cookie).expect(200))
        .body,
    );
    expect(lines.map((line) => [line.role, line.text])).toEqual([
      ['guest', 'What are you up to?'],
      ['agent', 'Hi Mika! I am idle right now.'],
    ]);

    const body = RequestBodySchema.parse(fake.requests.at(-1)?.body);
    expect(body).not.toHaveProperty('tools');
    expect(JSON.stringify(body.messages)).toContain('You are ada_guest');
    expect(JSON.stringify(body.messages)).toContain('chatting with Mika');

    const prisma = app.get(PrismaService);
    expect(await prisma.transcriptEntry.count({ where: { agent_id: agent.id } })).toBe(0);
    const usage = await prisma.usageRecord.findFirst({
      where: { agent_id: agent.id },
      orderBy: { created_at: 'desc' },
    });
    expect(usage).toMatchObject({ run_id: null, model_id: TEST_INTERN_MODEL });
  });

  it('keeps each guest to their own conversation, which the owner can read', async () => {
    const agent = await recruit_test_agent(app, owner.owner_id, provider_id);
    const bo = await create_test_guest(app, owner, 'Bo');
    await say(mika, agent.id, 'From Mika').expect(201);
    await say(bo, agent.id, 'From Bo').expect(201);

    const of = async (cookie_or_token: { cookie?: string; token?: string }) => {
      const call = api().get(`/agents/${agent.id}/guest_chat`);
      if (cookie_or_token.cookie !== undefined) call.set('Cookie', cookie_or_token.cookie);
      if (cookie_or_token.token !== undefined) {
        call.set('Authorization', `Bearer ${cookie_or_token.token}`);
      }
      return GuestChatMessageSchema.array()
        .parse((await call.expect(200)).body)
        .map((line) => line.text);
    };
    expect(await of({ cookie: mika.cookie })).toEqual(['From Mika']);
    expect(await of({ cookie: bo.cookie })).toEqual(['From Bo']);
    expect(await of({ token: owner.token })).toEqual(['From Mika', 'From Bo']);
    await api()
      .post(`/agents/${agent.id}/guest_chat`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ text: 'Owner talks elsewhere' })
      .expect(403);
  });

  it('refuses a busy agent and a guest without a name', async () => {
    const agent = await recruit_test_agent(app, owner.owner_id, provider_id);
    const runs = app.get<RunRepository>(RUN_REPOSITORY);
    const run = await runs.create(owner.owner_id, agent.id, null);
    expect(await app.get(AgentService).claim_run(owner.owner_id, agent.id, run.id)).toBe(true);
    const busy = await say(mika, agent.id, 'Got a minute?').expect(409);
    expect(busy.text).toContain('busy with a task');

    const unnamed = await create_test_guest(app, owner);
    const idle = await recruit_test_agent(app, owner.owner_id, provider_id);
    await say(unnamed, idle.id, 'Hi').expect(409);
    await say(mika, randomUUID(), 'Anyone?').expect(409);
  });
});
