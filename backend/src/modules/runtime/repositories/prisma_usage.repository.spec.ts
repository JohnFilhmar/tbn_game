import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
  type UsageScope,
} from './interface/usage_repository.interface';

const MINUTE = 60_000;

describe('PrismaUsageRepository windows', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let usage: UsageRepository;
  let provider_id: string;
  let runs: string[];
  const now = Date.now();
  const at = (minutes_ago: number): Date => new Date(now - minutes_ago * MINUTE);

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    usage = app.get<UsageRepository>(USAGE_REPOSITORY);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    provider_id = provider.id;
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const prisma = app.get(PrismaService);
    runs = await Promise.all(
      [1, 2].map(async () => {
        const run = await prisma.run.create({
          data: { owner_id: owner.owner_id, agent_id: agent.id },
        });
        return run.id;
      }),
    );
    const rows = [
      { minutes_ago: 50, model_id: 'a', input_tokens: 100, output_tokens: 10, cost: 1, run: 0 },
      { minutes_ago: 30, model_id: 'a', input_tokens: 200, output_tokens: 20, cost: 2, run: 1 },
      { minutes_ago: 10, model_id: 'b', input_tokens: 50, output_tokens: 5, cost: 0.5, run: 1 },
    ];
    for (const row of rows) {
      await prisma.usageRecord.create({
        data: {
          owner_id: owner.owner_id,
          provider_id: provider.id,
          agent_id: agent.id,
          run_id: runs[row.run] ?? null,
          model_id: row.model_id,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          cost: row.cost,
          created_at: at(row.minutes_ago),
        },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  function scope(overrides: Partial<UsageScope>): UsageScope {
    return {
      owner_id: owner.owner_id,
      provider_id,
      model_id: null,
      unit: 'requests',
      after: at(60),
      ...overrides,
    };
  }

  it('sums requests, tokens and money after an instant, for one model or all', async () => {
    expect(await usage.amount(scope({}))).toBe(3);
    expect(await usage.amount(scope({ unit: 'tokens' }))).toBe(385);
    expect(await usage.amount(scope({ unit: 'money' }))).toBeCloseTo(3.5);
    expect(await usage.amount(scope({ model_id: 'a' }))).toBe(2);
    expect(await usage.amount(scope({ after: at(40) }))).toBe(2);
    expect(await usage.amount(scope({ owner_id: other.owner_id }))).toBe(0);
  });

  it('finds the oldest row whose leaving brings usage down by more than the excess', async () => {
    expect(await usage.oldest_beyond(scope({}), 0)).toEqual(at(50));
    expect(await usage.oldest_beyond(scope({}), 1)).toEqual(at(30));
    expect(await usage.oldest_beyond(scope({}), 2)).toEqual(at(10));
    expect(await usage.oldest_beyond(scope({}), 3)).toBeNull();
    expect(await usage.oldest_beyond(scope({ unit: 'tokens' }), 110)).toEqual(at(30));
    expect(await usage.oldest_beyond(scope({ unit: 'money' }), 0.5)).toEqual(at(50));
    expect(await usage.oldest_beyond(scope({ model_id: 'b' }), 0)).toEqual(at(10));
    expect(await usage.oldest_beyond(scope({ owner_id: other.owner_id }), 0)).toBeNull();
  });

  it('sums usage over several runs', async () => {
    expect(await usage.summarize_for_runs(owner.owner_id, runs)).toMatchObject({
      requests: 3,
      input_tokens: 350,
      output_tokens: 35,
    });
    expect((await usage.summarize_for_runs(owner.owner_id, [runs[1] ?? ''])).requests).toBe(2);
    expect((await usage.summarize_for_runs(owner.owner_id, [])).requests).toBe(0);
    expect((await usage.summarize_for_runs(other.owner_id, runs)).requests).toBe(0);
  });
});
