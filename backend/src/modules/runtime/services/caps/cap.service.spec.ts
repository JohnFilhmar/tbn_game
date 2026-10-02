import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import {
  create_test_provider,
  recruit_test_agent,
  TEST_INTERN_MODEL,
  TEST_PRIMARY_MODEL,
} from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { CapService, type ThresholdDefaults } from './cap.service';

const DEFAULTS: ThresholdDefaults = { longest_percent: 75, shorter_percent: 85 };
const MINUTE = 60_000;

describe('CapService', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let caps: CapService;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    caps = app.get(CapService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** A provider with no windows and an agent to attribute usage to. */
  async function bare_key(): Promise<{ provider_id: string; agent_id: string }> {
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    for (const window of await caps.statuses(owner.owner_id, provider.id, DEFAULTS)) {
      await caps.delete(owner.owner_id, provider.id, window.id);
    }
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    return { provider_id: provider.id, agent_id: agent.id };
  }

  async function use(
    key: { provider_id: string; agent_id: string },
    model_id: string,
    created_at = new Date(),
  ): Promise<void> {
    await app.get(PrismaService).usageRecord.create({
      data: {
        owner_id: owner.owner_id,
        provider_id: key.provider_id,
        agent_id: key.agent_id,
        model_id,
        input_tokens: 100,
        output_tokens: 20,
        cost: 0.01,
        created_at,
      },
    });
  }

  it('measures the example windows and picks the default threshold by length', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    await use({ provider_id: provider.id, agent_id: agent.id }, TEST_PRIMARY_MODEL);

    const statuses = await caps.statuses(owner.owner_id, provider.id, DEFAULTS);
    expect(
      statuses.map((status) => [
        status.name,
        status.enforced,
        status.effective_threshold_percent,
        status.used,
        status.state,
      ]),
    ).toEqual([
      ['Monthly', false, 75, 120, 'ok'],
      ['Weekly', false, 85, 120, 'ok'],
      ['Daily', false, 85, 120, 'ok'],
    ]);
    await expect(caps.statuses(other.owner_id, provider.id, DEFAULTS)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('enforces only enforced windows that count the model', async () => {
    const key = await bare_key();
    const hourly = await caps.create(owner.owner_id, key.provider_id, {
      name: 'Primary hourly',
      length_count: 1,
      length_unit: 'hour',
      reset_mode: 'rolling',
      unit: 'requests',
      limit: 4,
      threshold_percent: 50,
      enforced: true,
      model_id: TEST_PRIMARY_MODEL,
    });
    await caps.create(owner.owner_id, key.provider_id, {
      name: 'Display only',
      length_count: 1,
      length_unit: 'day',
      reset_mode: 'rolling',
      unit: 'requests',
      limit: 1,
    });
    await use(key, TEST_PRIMARY_MODEL);
    await use(key, TEST_PRIMARY_MODEL);

    const past = await caps.past_threshold(
      owner.owner_id,
      key.provider_id,
      TEST_PRIMARY_MODEL,
      DEFAULTS,
    );
    expect(past.map((window) => [window.id, window.state])).toEqual([
      [hourly.id, 'past_threshold'],
    ]);
    expect(
      await caps.past_threshold(owner.owner_id, key.provider_id, TEST_INTERN_MODEL, DEFAULTS),
    ).toEqual([]);
    expect(await caps.limit_block(owner.owner_id, key.provider_id, TEST_PRIMARY_MODEL)).toBeNull();

    await use(key, TEST_PRIMARY_MODEL);
    await use(key, TEST_PRIMARY_MODEL);
    const block = await caps.limit_block(owner.owner_id, key.provider_id, TEST_PRIMARY_MODEL);
    expect(block?.window_names).toEqual(['Primary hourly']);
    expect(await caps.limit_block(owner.owner_id, key.provider_id, TEST_INTERN_MODEL)).toBeNull();
  });

  it('says a fixed window at its limit resets at its next boundary', async () => {
    const key = await bare_key();
    const anchor = new Date(Date.now() + 5_000);
    await caps.create(owner.owner_id, key.provider_id, {
      name: 'Hourly',
      length_count: 1,
      length_unit: 'hour',
      reset_mode: 'fixed',
      anchor_at: anchor.toISOString(),
      unit: 'requests',
      limit: 1,
      enforced: true,
    });
    await use(key, TEST_PRIMARY_MODEL);

    const block = await caps.limit_block(owner.owner_id, key.provider_id, TEST_PRIMARY_MODEL);
    expect(block?.resume_at).toEqual(anchor);
    const [status] = await caps.statuses(owner.owner_id, key.provider_id, DEFAULTS);
    expect(status).toMatchObject({
      state: 'at_limit',
      resets_at: anchor,
      window_start: new Date(anchor.getTime() - 60 * MINUTE),
    });
  });

  it('says a rolling window at its limit drops below it once its oldest excess leaves', async () => {
    const key = await bare_key();
    await caps.create(owner.owner_id, key.provider_id, {
      name: 'Rolling hour',
      length_count: 1,
      length_unit: 'hour',
      reset_mode: 'rolling',
      unit: 'requests',
      limit: 2,
      enforced: true,
    });
    const now = Date.now();
    await use(key, TEST_PRIMARY_MODEL, new Date(now - 50 * MINUTE));
    await use(key, TEST_PRIMARY_MODEL, new Date(now - 20 * MINUTE));
    await use(key, TEST_PRIMARY_MODEL, new Date(now - 5 * MINUTE));

    const block = await caps.limit_block(owner.owner_id, key.provider_id, TEST_PRIMARY_MODEL);
    expect(block?.resume_at).toEqual(new Date(now - 20 * MINUTE + 60 * MINUTE));
    const [status] = await caps.statuses(owner.owner_id, key.provider_id, DEFAULTS);
    expect(status?.resets_at).toEqual(new Date(now + 40 * MINUTE));
  });

  it('rejects a fixed window without an anchor and a model the key lacks', async () => {
    const key = await bare_key();
    const base = {
      name: 'Bad',
      length_count: 1,
      length_unit: 'day' as const,
      unit: 'tokens' as const,
      limit: 10,
    };
    await expect(
      caps.create(owner.owner_id, key.provider_id, { ...base, reset_mode: 'fixed' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      caps.create(owner.owner_id, key.provider_id, {
        ...base,
        reset_mode: 'rolling',
        model_id: 'not-offered',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      caps.create(other.owner_id, key.provider_id, { ...base, reset_mode: 'rolling' }),
    ).rejects.toThrow(NotFoundException);
    const window = await caps.create(owner.owner_id, key.provider_id, {
      ...base,
      reset_mode: 'rolling',
    });
    await expect(
      caps.update(owner.owner_id, key.provider_id, window.id, { reset_mode: 'fixed' }),
    ).rejects.toThrow(BadRequestException);
    await expect(caps.delete(other.owner_id, key.provider_id, window.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
