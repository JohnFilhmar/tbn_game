import type { NestExpressApplication } from '@nestjs/platform-express';
import { ProviderSchema, UsageSummarySchema, type CreateProvider } from '@tbn/contracts';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '@/lib/database/prisma.service';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import { ValidationErrorBodySchema } from '@/testing/http';
import { LogCapture } from '@/testing/log_capture';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const API_KEY = 'sk-ant-LEAKCANARY-0123456789abcdef';
const SECOND_KEY = 'sk-ant-SECONDCANARY-fedcba9876543210';

const create_body: CreateProvider = {
  name: 'anthropic',
  api_format: 'anthropic_messages',
  base_url: 'https://api.anthropic.com',
  api_key: API_KEY,
  models: [
    {
      model_id: 'claude-model-a',
      cost_tier: 'premium',
      input_price_per_million: 3,
      output_price_per_million: 15,
    },
    { model_id: 'claude-model-b', cost_tier: 'cheap' },
  ],
};

describe('provider routes', () => {
  const logs = new LogCapture();
  let app: NestExpressApplication;
  let owner: TestOwner;
  const responses: string[] = [];

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(
      { ...load_test_config(), log_level: 'trace' },
      { log_destination: logs },
    );
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token on every route', async () => {
    await api().get('/providers').expect(401);
    await api().post('/providers').send(create_body).expect(401);
  });

  it('creates, lists, reads, updates and deletes a provider without ever returning the key', async () => {
    const created = await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(create_body)
      .expect(201);
    responses.push(created.text);
    const provider = ProviderSchema.parse(created.body);
    expect(provider).toMatchObject({
      name: 'anthropic',
      api_format: 'anthropic_messages',
      api_key_set: true,
      models: [
        expect.objectContaining({ model_id: 'claude-model-a', max_output_tokens: 8192 }),
        expect.objectContaining({ model_id: 'claude-model-b', input_price_per_million: null }),
      ],
    });

    const listed = await api()
      .get('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    responses.push(listed.text);
    expect(
      ProviderSchema.array()
        .parse(listed.body)
        .map((item) => item.id),
    ).toContain(provider.id);

    const read = await api()
      .get(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    responses.push(read.text);

    const updated = await api()
      .patch(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'anthropic-renamed',
        api_key: SECOND_KEY,
        models: [{ model_id: 'claude-model-c', cost_tier: 'standard', max_output_tokens: 1024 }],
      })
      .expect(200);
    responses.push(updated.text);
    expect(ProviderSchema.parse(updated.body)).toMatchObject({
      name: 'anthropic-renamed',
      models: [expect.objectContaining({ model_id: 'claude-model-c', max_output_tokens: 1024 })],
    });

    const row = await app
      .get(PrismaService)
      .provider.findUniqueOrThrow({ where: { id: provider.id } });
    expect(row.api_key_ciphertext).not.toContain(SECOND_KEY);
    expect(row.api_key_ciphertext).not.toContain(API_KEY);

    await api()
      .delete(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await api()
      .get(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('rejects a bad base URL, an empty model list, a repeated model id, an unknown field and a duplicate name', async () => {
    const bad_url = await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...create_body, name: 'bad-url', base_url: 'ftp://example.com' })
      .expect(400);
    expect(ValidationErrorBodySchema.parse(bad_url.body).issues[0]?.path).toBe('base_url');

    await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...create_body, name: 'no-models', models: [] })
      .expect(400);

    const repeated = await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        ...create_body,
        name: 'repeated-model',
        models: [
          { model_id: 'same-model', cost_tier: 'premium' },
          { model_id: 'same-model', cost_tier: 'cheap' },
        ],
      })
      .expect(400);
    expect(ValidationErrorBodySchema.parse(repeated.body).issues[0]?.path).toBe('models');

    await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...create_body, name: 'extra', region: 'eu' })
      .expect(400);

    await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...create_body, name: 'dup' })
      .expect(201);
    await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...create_body, name: 'dup' })
      .expect(409);
  });

  it("hides another owner's provider", async () => {
    const other = await create_test_owner(app);
    const created = await api()
      .post('/providers')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ ...create_body, name: 'other-owner' })
      .expect(201);
    const provider = ProviderSchema.parse(created.body);

    await api()
      .get(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await api()
      .patch(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'stolen' })
      .expect(404);
    await api()
      .delete(`/providers/${provider.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('sums usage per provider and per model', async () => {
    const created = await api()
      .post('/providers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ ...create_body, name: 'usage' })
      .expect(201);
    const provider = ProviderSchema.parse(created.body);
    const usage = app.get<UsageRepository>(USAGE_REPOSITORY);
    const base = {
      owner_id: owner.owner_id,
      provider_id: provider.id,
      agent_id: owner.owner_id,
      run_id: null,
    };
    const fake_agent = await create_usage_agent(app, owner.owner_id, provider.id);
    await usage.create({
      ...base,
      agent_id: fake_agent,
      model_id: 'claude-model-a',
      input_tokens: 100,
      output_tokens: 10,
      cache_read_tokens: 0,
      cache_write_tokens: 50,
      cost: 0.5,
    });
    await usage.create({
      ...base,
      agent_id: fake_agent,
      model_id: 'claude-model-a',
      input_tokens: 200,
      output_tokens: 20,
      cache_read_tokens: 150,
      cache_write_tokens: 0,
      cost: 0.25,
    });
    await usage.create({
      ...base,
      agent_id: fake_agent,
      model_id: 'claude-model-b',
      input_tokens: 10,
      output_tokens: 1,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost: 0,
    });

    const response = await api()
      .get(`/providers/${provider.id}/usage`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    responses.push(response.text);
    expect(UsageSummarySchema.parse(response.body)).toEqual({
      provider_id: provider.id,
      requests: 3,
      input_tokens: 310,
      output_tokens: 31,
      cache_read_tokens: 150,
      cache_write_tokens: 50,
      cost: 0.75,
      by_model: [
        {
          model_id: 'claude-model-a',
          requests: 2,
          input_tokens: 300,
          output_tokens: 30,
          cache_read_tokens: 150,
          cache_write_tokens: 50,
          cost: 0.75,
        },
        {
          model_id: 'claude-model-b',
          requests: 1,
          input_tokens: 10,
          output_tokens: 1,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          cost: 0,
        },
      ],
    });
    await api()
      .get(`/providers/${owner.owner_id}/usage`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('never writes a saved key into a response or a log', () => {
    expect(responses.length).toBeGreaterThan(3);
    for (const text of responses) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(SECOND_KEY);
    }
    expect(logs.text.length).toBeGreaterThan(0);
    expect(logs.text).not.toContain(API_KEY);
    expect(logs.text).not.toContain(SECOND_KEY);
  });
});

/** Usage rows need an agent; until the company module lands, insert the minimum rows directly. */
async function create_usage_agent(
  app: NestExpressApplication,
  owner_id: string,
  provider_id: string,
): Promise<string> {
  const prisma = app.get(PrismaService);
  const department = await prisma.department.create({ data: { owner_id, name: 'Usage' } });
  const agent = await prisma.agent.create({
    data: {
      owner_id,
      name: `usage_${randomBytes(4).toString('hex')}`,
      role: 'Usage',
      job_description: 'Usage rows',
      level: 1,
      department_id: department.id,
      provider_id,
      primary_model: 'claude-model-a',
      intern_model: 'claude-model-b',
    },
  });
  return agent.id;
}
