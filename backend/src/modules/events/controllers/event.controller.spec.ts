import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventsPageSchema, InstructionSchema, IntegrationSchema } from '@tbn/contracts';
import request from 'supertest';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import {
  EVENT_REPOSITORY,
  type EventRepository,
} from '@/modules/events/repositories/interface/event_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const GoneBodySchema = z.looseObject({ head_seq: z.number(), oldest_seq: z.number() });

describe('GET /events', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${owner.token}` });

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  async function page(after: number, limit = 200): Promise<z.infer<typeof EventsPageSchema>> {
    const response = await api().get('/events').query({ after, limit }).set(auth()).expect(200);
    return EventsPageSchema.parse(response.body);
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token', async () => {
    await api().get('/events').expect(401);
  });

  it('returns each change after the cursor with the entity as its route shows it', async () => {
    const created = InstructionSchema.parse(
      (
        await api()
          .post('/instructions')
          .set(auth())
          .send({ scope: 'global', title: 'Rule', body: 'Be brief.' })
          .expect(201)
      ).body,
    );
    await api()
      .patch(`/instructions/${created.id}`)
      .set(auth())
      .send({ title: 'Rule one' })
      .expect(200);
    const shown = InstructionSchema.parse(
      (await api().get(`/instructions/${created.id}`).set(auth()).expect(200)).body,
    );
    await api().delete(`/instructions/${created.id}`).set(auth()).expect(204);

    const all = await page(0);
    expect(all.head_seq).toBe(3);
    expect(all.events).toMatchObject([
      { seq: 1, entity: 'instruction', id: created.id, op: 'insert', changed: null },
      { seq: 2, entity: 'instruction', id: created.id, op: 'update', changed: ['title'] },
      { seq: 3, entity: 'instruction', id: created.id, op: 'delete', data: null },
    ]);
    expect(all.events[1]?.data).toBeNull();
    expect((await page(1, 1)).events.map((event) => event.seq)).toEqual([2]);
    expect((await page(3)).events).toEqual([]);

    const again = InstructionSchema.parse(
      (
        await api()
          .post('/instructions')
          .set(auth())
          .send({ scope: 'global', title: 'Kept', body: 'Still here.' })
          .expect(201)
      ).body,
    );
    const [kept] = (await page(3)).events;
    expect(kept?.data).toEqual(
      InstructionSchema.parse(
        (await api().get(`/instructions/${again.id}`).set(auth()).expect(200)).body,
      ),
    );
    expect(shown.title).toBe('Rule one');

    const theirs = await api()
      .get('/events')
      .set({ Authorization: `Bearer ${other.token}` });
    expect(EventsPageSchema.parse(theirs.body)).toEqual({ head_seq: 0, events: [] });
  });

  it("sends an agent's attachments as their own view, under the agent's id", async () => {
    const mine = await create_test_owner(app);
    const as_mine = { Authorization: `Bearer ${mine.token}` };
    const provider = await create_test_provider(app, mine.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, mine.owner_id, provider.id);
    const integration = IntegrationSchema.parse(
      (
        await api()
          .post('/integrations')
          .set(as_mine)
          .send({
            name: 'Pager',
            method: 'POST',
            url: 'http://127.0.0.1:9/hook',
            body_format: 'json',
            body_template: '{"text": "{{text}}"}',
            placeholders: [{ name: 'text', description: 'The text', required: true }],
          })
          .expect(201)
      ).body,
    );
    const head = EventsPageSchema.parse(
      (await api().get('/events').query({ after: 0, limit: 1 }).set(as_mine).expect(200)).body,
    ).head_seq;
    await api().post(`/agents/${agent.id}/integrations/${integration.id}`).set(as_mine).expect(201);
    await api()
      .delete(`/agents/${agent.id}/integrations/${integration.id}`)
      .set(as_mine)
      .expect(204);
    const after = EventsPageSchema.parse(
      (await api().get('/events').query({ after: head }).set(as_mine).expect(200)).body,
    ).events;
    expect(after.map(({ entity, id, op }) => ({ entity, id, op }))).toEqual([
      { entity: 'agent_attachments', id: agent.id, op: 'update' },
      { entity: 'agent_attachments', id: agent.id, op: 'update' },
    ]);
    expect(after[1]?.data).toEqual({ agent_id: agent.id, integration_ids: [], plugin_ids: [] });
  });

  it('rejects a bad cursor, and answers 410 once the events after it are pruned', async () => {
    await api().get('/events').query({ after: -1 }).set(auth()).expect(400);
    await api().get('/events').query({ limit: 5_000 }).set(auth()).expect(400);
    await api().get('/events').query({ after: 99 }).set(auth()).expect(410);

    await app.get(PrismaService).event.updateMany({
      where: { owner_id: owner.owner_id, seq: { lte: 2 } },
      data: { created_at: new Date(0) },
    });
    await app.get<EventRepository>(EVENT_REPOSITORY).prune(new Date(1_000));
    const gone = await api().get('/events').query({ after: 0 }).set(auth()).expect(410);
    expect(GoneBodySchema.parse(gone.body)).toMatchObject({ head_seq: 4, oldest_seq: 3 });
    expect((await page(2)).events.map((event) => event.seq)).toEqual([3, 4]);
  });
});
