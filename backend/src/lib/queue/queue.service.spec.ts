import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { load_test_config } from '@/testing/test_app';
import { create_test_database, migrate_test_database } from '@/testing/test_database';
import { wait_for } from '@/testing/wait_for';
import { QueueService } from './queue.service';
import type { AgentWakeJob } from './queues';

async function settles_within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => {
    setTimeout(() => resolve(false), ms);
  });
  return Promise.race([promise.then(() => true), timeout]);
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('QueueService', () => {
  const queue = new QueueService(load_test_config(), 'worker');

  beforeAll(() => {
    queue.onApplicationBootstrap();
  });

  afterAll(async () => {
    await queue.beforeApplicationShutdown();
  });

  it('delivers an agent wake to the handler', async () => {
    const received: AgentWakeJob[] = [];
    const job = { owner_id: randomUUID(), agent_id: randomUUID() };
    await queue.work_agent_wake(async (data) => {
      received.push(data);
      await Promise.resolve();
    });

    await queue.send_agent_wake(job);

    const delivered = await wait_for('the wake to be handled', () =>
      received.find((item) => item.agent_id === job.agent_id),
    );
    expect(delivered).toEqual(job);
    expect(queue.stopping).toBe(false);
  });
});

describe('QueueService on a database without the queue schema', () => {
  it('waits for the migration release step instead of failing', async () => {
    const config = load_test_config();
    const database = await create_test_database(config);
    const queue = new QueueService(
      { ...config, database: { ...config.database, url: database.url } },
      'worker',
    );
    try {
      queue.onApplicationBootstrap();
      const received: AgentWakeJob[] = [];
      const working = queue.work_agent_wake(async (data) => {
        received.push(data);
        await Promise.resolve();
      });
      expect(await settles_within(working, 1_000)).toBe(false);

      await migrate_test_database(database.url);
      await working;

      const job = { owner_id: randomUUID(), agent_id: randomUUID() };
      await queue.send_agent_wake(job);
      expect(await wait_for('the wake to be handled', () => received[0])).toEqual(job);
    } finally {
      await queue.beforeApplicationShutdown();
      await database.drop();
    }
  }, 60_000);

  it('shuts down while still waiting', async () => {
    const config = load_test_config();
    const database = await create_test_database(config);
    const queue = new QueueService(
      { ...config, database: { ...config.database, url: database.url } },
      'worker',
    );
    try {
      queue.onApplicationBootstrap();
      const working = queue.work_agent_wake(() => Promise.resolve());
      expect(await settles_within(working, 500)).toBe(false);

      const started = Date.now();
      await queue.beforeApplicationShutdown();
      expect(Date.now() - started).toBeLessThan(3_000);
      await expect(working).rejects.toThrow();
    } finally {
      await database.drop();
    }
  }, 30_000);
});
