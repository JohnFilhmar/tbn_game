import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { CommandStore } from './command_store';

describe('the command store', () => {
  let app: NestExpressApplication;
  let store: CommandStore;
  let owner: TestOwner;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    store = app.get(CommandStore);
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('claims a key once and then reports it running', async () => {
    const key = randomUUID();
    expect(await store.begin(owner.owner_id, key, 'hash-a')).toEqual({ state: 'started' });
    expect(await store.begin(owner.owner_id, key, 'hash-a')).toEqual({ state: 'running' });
    expect(await store.begin(owner.owner_id, key, 'hash-b')).toEqual({
      state: 'different_request',
    });
  });

  it('claims a key for one of several concurrent requests', async () => {
    const key = randomUUID();
    const starts = await Promise.all(
      Array.from({ length: 8 }, () => store.begin(owner.owner_id, key, 'hash-a')),
    );
    expect(starts.filter((start) => start.state === 'started')).toHaveLength(1);
    expect(starts.filter((start) => start.state === 'running')).toHaveLength(7);
  });

  it('answers a repeat with the stored status and body', async () => {
    const key = randomUUID();
    await store.begin(owner.owner_id, key, 'hash-a');
    await store.finish(owner.owner_id, key, { status: 201, body: { id: 'x', tags: ['a', null] } });
    expect(await store.begin(owner.owner_id, key, 'hash-a')).toEqual({
      state: 'answered',
      answer: { status: 201, body: { id: 'x', tags: ['a', null] } },
    });

    const empty = randomUUID();
    await store.begin(owner.owner_id, empty, 'hash-a');
    await store.finish(owner.owner_id, empty, { status: 204, body: undefined });
    expect(await store.begin(owner.owner_id, empty, 'hash-a')).toEqual({
      state: 'answered',
      answer: { status: 204, body: undefined },
    });
  });

  it('keeps the first answer and lets a forgotten key run again', async () => {
    const key = randomUUID();
    await store.begin(owner.owner_id, key, 'hash-a');
    await store.forget(owner.owner_id, key);
    expect(await store.begin(owner.owner_id, key, 'hash-a')).toEqual({ state: 'started' });
    await store.finish(owner.owner_id, key, { status: 200, body: 'first' });
    await store.finish(owner.owner_id, key, { status: 200, body: 'second' });
    await store.forget(owner.owner_id, key);
    expect(await store.begin(owner.owner_id, key, 'hash-a')).toEqual({
      state: 'answered',
      answer: { status: 200, body: 'first' },
    });
  });

  it('keeps the keys of each owner apart', async () => {
    const other = await create_test_owner(app);
    const key = randomUUID();
    await store.begin(owner.owner_id, key, 'hash-a');
    expect(await store.begin(other.owner_id, key, 'hash-b')).toEqual({ state: 'started' });
    await store.forget(other.owner_id, key);
    expect(await store.begin(owner.owner_id, key, 'hash-a')).toEqual({ state: 'running' });
  });

  it('prunes the commands created before a time', async () => {
    const old_key = randomUUID();
    const new_key = randomUUID();
    await store.begin(owner.owner_id, old_key, 'hash-a');
    await store.begin(owner.owner_id, new_key, 'hash-a');
    await app.get(PrismaService).command.updateMany({
      where: { owner_id: owner.owner_id, key: old_key },
      data: { created_at: new Date(Date.now() - 2 * 86_400_000) },
    });
    expect(await store.prune(new Date(Date.now() - 86_400_000))).toBeGreaterThanOrEqual(1);
    expect(await store.begin(owner.owner_id, old_key, 'hash-b')).toEqual({ state: 'started' });
    expect(await store.begin(owner.owner_id, new_key, 'hash-a')).toEqual({ state: 'running' });
  });
});
