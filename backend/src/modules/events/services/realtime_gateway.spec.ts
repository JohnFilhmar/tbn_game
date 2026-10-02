import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { StreamPublisherService } from '@/lib/realtime/stream_publisher.service';
import { RealtimeClient } from '@/lib/realtime_client/realtime_client';
import {
  EVENT_REPOSITORY,
  type EventRepository,
} from '@/modules/events/repositories/interface/event_repository.interface';
import { InstructionService } from '@/modules/knowledge/services/instruction.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { RealtimeGatewayService } from './realtime_gateway.service';

const RULE = { scope: 'global' as const, title: 'Rule', body: 'Be brief.' };

describe('the realtime gateway', () => {
  let app: NestExpressApplication;
  let url: string;
  const clients: RealtimeClient[] = [];

  function client(token: string, cursor: number | null = null): RealtimeClient {
    const created = new RealtimeClient({ url, token, cursor });
    clients.push(created);
    return created;
  }

  function rule(owner: TestOwner, title = 'Rule'): Promise<unknown> {
    return app.get(InstructionService).create(owner.owner_id, { ...RULE, title });
  }

  function range(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const port =
      typeof address === 'object' && address !== null ? (address satisfies AddressInfo).port : 0;
    url = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    for (const created of clients.splice(0)) created.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a missing token, a wrong one and an expired session', async () => {
    const owner = await create_test_owner(app);
    await expect(client('').connect()).rejects.toThrow('unauthorized');
    await expect(client('tbn_not-a-session').connect()).rejects.toThrow('unauthorized');
    await app.get(PrismaService).session.updateMany({
      where: { owner_id: owner.owner_id },
      data: { expires_at: new Date(Date.now() - 1_000) },
    });
    await expect(client(owner.token).connect()).rejects.toThrow('unauthorized');
  });

  it('without a cursor says hello with the head and sends only what follows', async () => {
    const owner = await create_test_owner(app);
    await rule(owner, 'Before');
    const watcher = client(owner.token);
    expect(await watcher.connect()).toEqual({ head_seq: 1, cursor: 1 });
    await rule(owner, 'After');
    await watcher.until('the new rule', () => watcher.events.length === 1);
    expect(watcher.events[0]).toMatchObject({
      seq: 2,
      entity: 'instruction',
      op: 'insert',
      data: { title: 'After' },
    });
    expect(watcher.faults).toEqual([]);
  });

  it('resumes from a cursor with exactly what came after it, while changes keep coming', async () => {
    const owner = await create_test_owner(app);
    for (let index = 0; index < 5; index += 1) await rule(owner, `Old ${index}`);
    const writing = (async () => {
      for (let index = 0; index < 30; index += 1) await rule(owner, `New ${index}`);
    })();
    const watcher = client(owner.token, 2);
    expect((await watcher.connect()).cursor).toBe(2);
    await writing;
    await watcher.until('every event', () => watcher.last_seq === 35);
    expect(watcher.events.map((event) => event.seq)).toEqual(range(3, 35));
    expect(watcher.faults).toEqual([]);

    watcher.disconnect();
    for (let index = 0; index < 3; index += 1) await rule(owner, `Away ${index}`);
    await watcher.connect();
    await watcher.until('the missed events', () => watcher.last_seq === 38);
    expect(watcher.events.map((event) => event.seq)).toEqual(range(3, 38));
    expect(watcher.faults).toEqual([]);
    expect(watcher.connections).toBe(2);
  });

  it('asks a client to resync when its cursor is ahead of the head or was pruned', async () => {
    const owner = await create_test_owner(app);
    await rule(owner);
    await rule(owner);
    const ahead = client(owner.token, 9);
    expect(await ahead.connect()).toEqual({ head_seq: 2, cursor: 2 });
    expect(ahead.resyncs).toEqual([{ head_seq: 2, oldest_seq: 1 }]);

    await app.get(PrismaService).event.updateMany({
      where: { owner_id: owner.owner_id, seq: 1 },
      data: { created_at: new Date(0) },
    });
    await app.get<EventRepository>(EVENT_REPOSITORY).prune(new Date(1_000));
    const behind = client(owner.token, 0);
    expect(await behind.connect()).toEqual({ head_seq: 2, cursor: 2 });
    expect(behind.resyncs).toEqual([{ head_seq: 2, oldest_seq: 2 }]);
    const caught_up = client(owner.token, 1);
    expect((await caught_up.connect()).cursor).toBe(1);
    await caught_up.until('the kept event', () => caught_up.last_seq === 2);
    expect(caught_up.resyncs).toEqual([]);
  });

  it('closes the socket when the session ends', async () => {
    const owner = await create_test_owner(app);
    const watcher = client(owner.token);
    await watcher.connect();
    expect(app.get(RealtimeGatewayService).open_sockets(owner.owner_id)).toBe(1);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set({ Authorization: `Bearer ${owner.token}` })
      .expect(204);
    await app.get(RealtimeGatewayService).check_sessions();
    await watcher.until('the socket to close', () => !watcher.connected);
    expect(app.get(RealtimeGatewayService).open_sockets(owner.owner_id)).toBe(0);
  });

  it('forwards streamed output live to the owner only, and never replays it', async () => {
    const owner = await create_test_owner(app);
    const other = await create_test_owner(app);
    const watcher = client(owner.token, 0);
    const stranger = client(other.token, 0);
    await watcher.connect();
    await stranger.connect();
    const stream = app.get(StreamPublisherService).open({
      owner_id: owner.owner_id,
      agent_id: owner.owner_id,
      run_id: owner.owner_id,
      after_seq: 0,
    });
    stream.text('Hello ', 1);
    stream.text('there.', 1);
    await stream.close();
    await watcher.until('the last chunk', () => watcher.chunks.some((chunk) => chunk.done));
    expect(watcher.chunks.map((chunk) => chunk.text).join('')).toBe('Hello there.');
    expect(watcher.chunks.every((chunk) => chunk.attempt === 1)).toBe(true);

    await rule(owner);
    await watcher.until('the rule', () => watcher.events.length === 1);
    const seen = watcher.chunks.length;
    watcher.disconnect();
    await watcher.connect();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(watcher.chunks).toHaveLength(seen);
    expect(stranger.chunks).toEqual([]);
  });
});
