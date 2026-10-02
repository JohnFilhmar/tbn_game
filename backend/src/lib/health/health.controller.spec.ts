import type { NestExpressApplication } from '@nestjs/platform-express';
import { HealthResponseSchema } from '@tbn/contracts';
import request from 'supertest';
import {
  UNREACHABLE_DATABASE_URL,
  create_test_web_app,
  load_test_config,
} from '@/testing/test_app';

describe('GET /health on the web process', () => {
  describe('with a reachable database', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await create_test_web_app(load_test_config());
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers 200 without credentials, with a body that matches the contract', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(HealthResponseSchema.parse(response.body)).toMatchObject({
        status: 'ok',
        process_type: 'web',
        checks: { database: 'ok' },
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('with an unreachable database', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      const config = load_test_config();
      app = await create_test_web_app({
        ...config,
        database: { ...config.database, url: UNREACHABLE_DATABASE_URL },
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers 503 with status unavailable', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(503);

      expect(HealthResponseSchema.parse(response.body)).toMatchObject({
        status: 'unavailable',
        checks: { database: 'unavailable' },
      });
    });
  });
});
