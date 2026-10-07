import type { NestExpressApplication } from '@nestjs/platform-express';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  PROVIDER_REPOSITORY,
  type ProviderRepository,
} from './interface/provider_repository.interface';

describe('PrismaProviderRepository state', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let providers: ProviderRepository;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    providers = app.get<ProviderRepository>(PROVIDER_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('opens the breaker at the threshold and closes it on success', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const until = new Date(Date.now() + 60_000);

    expect(await providers.record_failure(owner.owner_id, provider.id, 2, until)).toEqual({
      breaker_failures: 1,
      breaker_open_until: null,
      out_of_credit_since: null,
    });
    expect(await providers.record_failure(owner.owner_id, provider.id, 2, until)).toEqual({
      breaker_failures: 2,
      breaker_open_until: until,
      out_of_credit_since: null,
    });
    expect(await providers.record_failure(other.owner_id, provider.id, 2, until)).toBeNull();

    await providers.record_success(owner.owner_id, provider.id);
    expect(await providers.find(owner.owner_id, provider.id)).toMatchObject({
      breaker_failures: 0,
      breaker_open_until: null,
    });
  });

  it('holds a key until the later of two holds, for its owner only', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    const soon = new Date(Date.now() + 60_000);
    const later = new Date(Date.now() + 3_600_000);

    await providers.hold_until(owner.owner_id, provider.id, later);
    await providers.hold_until(owner.owner_id, provider.id, soon);
    await providers.hold_until(other.owner_id, provider.id, new Date(Date.now() + 7_200_000));
    expect(await providers.find(owner.owner_id, provider.id)).toMatchObject({
      breaker_failures: 0,
      breaker_open_until: later,
    });
  });

  it('marks a key out of credit once and clears it for its owner only', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    const first = new Date(Date.now() - 5_000);
    await providers.mark_out_of_credit(owner.owner_id, provider.id, first);
    await providers.mark_out_of_credit(owner.owner_id, provider.id, new Date());
    await providers.mark_out_of_credit(other.owner_id, provider.id, new Date());
    expect((await providers.find(owner.owner_id, provider.id))?.out_of_credit_since).toEqual(first);

    expect(await providers.clear_state(other.owner_id, provider.id)).toBe(false);
    expect(await providers.clear_state(owner.owner_id, provider.id)).toBe(true);
    expect((await providers.find(owner.owner_id, provider.id))?.out_of_credit_since).toBeNull();
  });

  it('finds the local provider of its owner only', async () => {
    const local = await app.get(ProviderService).create(owner.owner_id, {
      name: 'ollama',
      api_format: 'openai_chat_completions',
      base_url: 'http://127.0.0.1:9/v1',
      api_key: 'unused',
      is_local: true,
      models: [{ model_id: 'llama', cost_tier: 'cheap' }],
    });
    expect((await providers.find_local(owner.owner_id))?.id).toBe(local.id);
    expect(await providers.find_local(other.owner_id)).toBeNull();
  });
});
