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

describe('QueueService wakes of one agent', () => {
  const queue = new QueueService(load_test_config(), 'worker');

  beforeAll(() => {
    queue.onApplicationBootstrap();
  });

  afterAll(async () => {
    await queue.beforeApplicationShutdown();
  });

  it('handles one wake of an agent at a time, and other agents meanwhile', async () => {
    const owner_id = randomUUID();
    const busy = randomUUID();
    const other = randomUUID();
    const spans: Array<{ agent_id: string; start: number; end: number }> = [];
    await queue.work_agent_wake(async (job) => {
      if (job.owner_id !== owner_id) return;
      const start = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      spans.push({ agent_id: job.agent_id, start, end: Date.now() });
    });

    for (let index = 0; index < 3; index += 1) {
      await queue.send_agent_wake({ owner_id, agent_id: busy }, 1);
    }
    await queue.send_agent_wake({ owner_id, agent_id: other }, 1);

    await wait_for('every wake to be handled', () => (spans.length === 4 ? true : undefined), {
      timeout_ms: 40_000,
    });
    const overlaps = (a: (typeof spans)[number], b: (typeof spans)[number]): boolean =>
      a.start < b.end && b.start < a.end;
    const busy_spans = spans.filter((span) => span.agent_id === busy);
    expect(busy_spans).toHaveLength(3);
    expect(
      busy_spans.some((span, index) =>
        busy_spans.slice(index + 1).some((next) => overlaps(span, next)),
      ),
    ).toBe(false);
    const other_span = spans.find((span) => span.agent_id === other);
    expect(other_span !== undefined && busy_spans.some((span) => overlaps(span, other_span))).toBe(
      true,
    );
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
