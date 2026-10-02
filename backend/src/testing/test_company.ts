import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import type { Agent, ApiFormat, Provider, RecruitAgent } from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';

/** The model ids every test provider offers. */
export const TEST_PRIMARY_MODEL = 'test-primary';
export const TEST_INTERN_MODEL = 'test-intern';

/**
 * Creates a provider with the two test models.
 *
 * @param base_url - Usually a fake provider server's address.
 */
export function create_test_provider(
  app: INestApplicationContext,
  owner_id: string,
  api_format: ApiFormat,
  base_url = 'http://127.0.0.1:9',
): Promise<Provider> {
  return app.get(ProviderService).create(owner_id, {
    name: `provider_${randomBytes(4).toString('hex')}`,
    api_format,
    base_url,
    api_key: `sk-test-${randomBytes(8).toString('hex')}`,
    models: [
      {
        model_id: TEST_PRIMARY_MODEL,
        cost_tier: 'premium',
        input_price_per_million: 3,
        output_price_per_million: 15,
      },
      {
        model_id: TEST_INTERN_MODEL,
        cost_tier: 'cheap',
        input_price_per_million: 1,
        output_price_per_million: 5,
      },
    ],
  });
}

/** Recruits a level 1 agent on `provider_id` with a unique name. */
export function recruit_test_agent(
  app: INestApplicationContext,
  owner_id: string,
  provider_id: string,
  overrides: Partial<RecruitAgent> = {},
): Promise<Agent> {
  return app.get(AgentService).recruit(owner_id, {
    name: `agent_${randomBytes(4).toString('hex')}`,
    role: 'Writer',
    job_description: 'Writes short pieces on request.',
    provider_id,
    primary_model: TEST_PRIMARY_MODEL,
    intern_model: TEST_INTERN_MODEL,
    ...overrides,
  });
}
