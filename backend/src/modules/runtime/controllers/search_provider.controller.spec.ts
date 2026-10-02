import type { NestExpressApplication } from '@nestjs/platform-express';
import { SearchProviderSchema } from '@tbn/contracts';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { SearchProviderService } from '@/modules/runtime/services/search/search_provider.service';
import { LogCapture } from '@/testing/log_capture';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const API_KEY = 'leakcanary-key-aaaa';

describe('search provider routes', () => {
  const logs = new LogCapture();
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${owner.token}` });

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(
      { ...load_test_config(), log_level: 'trace' },
      { log_destination: logs },
    );
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a token on every route', async () => {
    await api().get('/search_providers').expect(401);
    await api().post('/search_providers').send({}).expect(401);
  });

  it('creates, lists, updates and deletes providers without returning the key', async () => {
    const created = SearchProviderSchema.parse(
      (
        await api()
          .post('/search_providers')
          .set(auth())
          .send({
            type: 'brave',
            name: 'Brave',
            base_url: 'https://api.search.brave.com',
            api_key: API_KEY,
            priority: 10,
            price_per_thousand_requests: 5,
          })
          .expect(201)
      ).body,
    );
    expect(created).toMatchObject({
      type: 'brave',
      name: 'Brave',
      api_key_set: true,
      priority: 10,
      enabled: true,
      price_per_thousand_requests: 5,
    });
    const second = SearchProviderSchema.parse(
      (
        await api()
          .post('/search_providers')
          .set(auth())
          .send({ type: 'searxng', name: 'Local', base_url: 'http://searxng:8080' })
          .expect(201)
      ).body,
    );
    expect(second).toMatchObject({ api_key_set: false, priority: 100 });

    const listed = SearchProviderSchema.array().parse(
      (await api().get('/search_providers').set(auth()).expect(200)).body,
    );
    expect(listed.map((provider) => provider.name)).toEqual(['Brave', 'Local']);
    expect(
      (await api().get('/search_providers').set('Authorization', `Bearer ${other.token}`)).body,
    ).toEqual([]);

    const updated = SearchProviderSchema.parse(
      (
        await api()
          .patch(`/search_providers/${created.id}`)
          .set(auth())
          .send({ enabled: false, priority: 200 })
          .expect(200)
      ).body,
    );
    expect(updated).toMatchObject({ enabled: false, priority: 200, api_key_set: true });

    await api()
      .post('/search_providers')
      .set(auth())
      .send({ type: 'brave', name: 'Brave', base_url: 'https://api.search.brave.com' })
      .expect(409);
    await api()
      .post('/search_providers')
      .set(auth())
      .send({ type: 'bing', name: 'Bing', base_url: 'https://bing.example' })
      .expect(400);
    await api()
      .patch(`/search_providers/${created.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ enabled: true })
      .expect(404);

    await api().delete(`/search_providers/${created.id}`).set(auth()).expect(204);
    await api().delete(`/search_providers/${created.id}`).set(auth()).expect(404);

    const stored = await app
      .get(PrismaService)
      .searchProvider.findFirst({ where: { id: second.id } });
    expect(stored?.api_key_ciphertext).toBeNull();
    expect(JSON.stringify([created, second, updated, listed])).not.toContain(API_KEY);
    expect(logs.text).not.toContain(API_KEY);
  });

  it('seeds the stack SearXNG once', async () => {
    const service = app.get(SearchProviderService);
    const seeded = await service.seed_searxng(owner.owner_id, 'http://searxng:8080');
    expect(seeded).toMatchObject({ type: 'searxng', name: 'SearXNG', enabled: true });
    expect(await service.seed_searxng(owner.owner_id, 'http://searxng:8080')).toBeNull();
    expect((await service.list(owner.owner_id)).filter((p) => p.name === 'SearXNG')).toHaveLength(
      1,
    );
  });
});
