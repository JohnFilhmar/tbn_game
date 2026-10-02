import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventsPageSchema, IDEMPOTENCY_KEY_HEADER } from '@tbn/contracts';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { RetentionService } from './retention.service';

const DAY_MS = 86_400_000;

describe('retention', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;

  function rule(title: string, key?: string): Promise<unknown> {
    const call = request(app.getHttpServer())
      .post('/instructions')
      .set('Authorization', `Bearer ${owner.token}`);
    if (key !== undefined) call.set(IDEMPOTENCY_KEY_HEADER, key);
    return call.send({ scope: 'global', title, body: 'Be brief.' }).expect(201);
  }

  beforeAll(async () => {
    const config = load_test_config();
    app = await create_test_web_app({
      ...config,
      retention: { event_days: 30, command_hours: 24 },
    });
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('prunes old events and commands, and a cursor before what is left must resync', async () => {
    const old_key = randomUUID();
    const new_key = randomUUID();
    await rule('Old one', old_key);
    await rule('Old two');
    await rule('Recent', new_key);
    const prisma = app.get(PrismaService);
    await prisma.event.updateMany({
      where: { owner_id: owner.owner_id, seq: { lte: 2 } },
      data: { created_at: new Date(Date.now() - 31 * DAY_MS) },
    });
    await prisma.command.updateMany({
      where: { owner_id: owner.owner_id, key: old_key },
      data: { created_at: new Date(Date.now() - 2 * DAY_MS) },
    });

    const pruned = await app.get(RetentionService).prune();
    expect(pruned.events).toBeGreaterThanOrEqual(2);
    expect(pruned.commands).toBeGreaterThanOrEqual(1);

    const left = await prisma.event.findMany({ where: { owner_id: owner.owner_id } });
    expect(left.map((event) => Number(event.seq))).toEqual([3]);
    expect(await prisma.command.count({ where: { owner_id: owner.owner_id } })).toBe(1);

    const auth = { Authorization: `Bearer ${owner.token}` };
    const gone = await request(app.getHttpServer())
      .get('/events')
      .query({ after: 1 })
      .set(auth)
      .expect(410);
    expect(gone.body).toMatchObject({ head_seq: 3, oldest_seq: 3 });
    const kept = await request(app.getHttpServer())
      .get('/events')
      .query({ after: 2 })
      .set(auth)
      .expect(200);
    expect(EventsPageSchema.parse(kept.body).events.map((event) => event.seq)).toEqual([3]);

    await rule('Old one', old_key);
    expect(await prisma.command.count({ where: { owner_id: owner.owner_id } })).toBe(2);
  });

  it('leaves everything when nothing is old enough', async () => {
    const before = await app
      .get(PrismaService)
      .event.count({ where: { owner_id: owner.owner_id } });
    await app.get(RetentionService).prune();
    expect(await app.get(PrismaService).event.count({ where: { owner_id: owner.owner_id } })).toBe(
      before,
    );
  });
});
