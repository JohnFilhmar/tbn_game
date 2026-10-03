import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { MetricsService } from '@/lib/metrics/metrics.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner } from '@/testing/test_owner';
import { DashboardMetricsService } from './dashboard_metrics.service';

/** The value of one series in the Prometheus text format, or undefined when it is absent. */
function series(text: string, name: string, labels: Record<string, string>): number | undefined {
  for (const line of text.split('\n')) {
    if (!line.startsWith(`${name}{`)) continue;
    const matches = Object.entries(labels).every(([key, value]) =>
      line.includes(`${key}="${value}"`),
    );
    if (matches) return Number(line.slice(line.lastIndexOf(' ') + 1));
  }
  return undefined;
}

describe('the dashboard figures', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports queue depth, runs, spend, cache lookups and disk after work happened', async () => {
    const owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const prisma = app.get(PrismaService);
    await prisma.run.create({
      data: { owner_id: owner.owner_id, agent_id: agent.id, status: 'failed', error: 'boom' },
    });
    await prisma.usageRecord.create({
      data: {
        owner_id: owner.owner_id,
        provider_id: provider.id,
        agent_id: agent.id,
        model_id: 'test-primary',
        input_tokens: 1_000,
        output_tokens: 100,
        cost: 0.25,
      },
    });
    await prisma.cacheEvent.create({
      data: { owner_id: owner.owner_id, kind: 'search', day: new Date(), hits: 3, misses: 1 },
    });

    await app.get(DashboardMetricsService).refresh();
    const text = await app.get(MetricsService).render();

    expect(series(text, 'tbn_runs', { status: 'failed' })).toBeGreaterThanOrEqual(1);
    expect(series(text, 'tbn_usage_cost', { provider: provider.name })).toBe(0.25);
    expect(series(text, 'tbn_usage_tokens', { provider: provider.name, kind: 'input' })).toBe(
      1_000,
    );
    expect(series(text, 'tbn_usage_requests', { provider: provider.name })).toBe(1);
    expect(
      series(text, 'tbn_cache_events', { cache: 'search', outcome: 'hit' }),
    ).toBeGreaterThanOrEqual(3);
    expect(
      series(text, 'tbn_queue_jobs', { queue: 'agent_wake', state: 'ready' }),
    ).toBeGreaterThanOrEqual(0);
    expect(
      series(text, 'tbn_queue_jobs', { queue: 'notify', state: 'deferred' }),
    ).toBeGreaterThanOrEqual(0);
    const disk = Number(/^tbn_workspace_disk_used_percent\{[^}]*\} (\d+)/m.exec(text)?.[1]);
    expect(disk).toBeGreaterThanOrEqual(0);
    expect(disk).toBeLessThanOrEqual(100);
  });
});
