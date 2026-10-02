import { randomUUID } from 'node:crypto';
import { load_test_config } from '@/testing/test_app';
import { wait_for } from '@/testing/wait_for';
import { QueueService } from './queue.service';
import type { AgentWakeJob } from './queues';

describe('QueueService', () => {
  const queue = new QueueService(load_test_config(), 'worker');

  beforeAll(async () => {
    await queue.onApplicationBootstrap();
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
