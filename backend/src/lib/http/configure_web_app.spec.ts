import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { create_test_web_app, load_test_config } from '@/testing/test_app';

describe('configure_web_app', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const config = load_test_config();
    app = await create_test_web_app({
      ...config,
      web: { ...config.web, body_limit_bytes: 1_024, cors_origins: ['https://allowed.example'] },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends security headers and hides the framework', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows only the configured CORS origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://allowed.example');
    const refused = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://elsewhere.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('https://allowed.example');
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a body over the size limit with 413 and no stack trace', async () => {
    const response = await request(app.getHttpServer())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(4_096) }))
      .expect(413);

    expect(response.body).toEqual(expect.objectContaining({ statusCode: 413 }));
    expect(response.text).not.toMatch(/\bat .+\.(?:js|ts):\d+/);
  });

  it('answers an unknown route with 404 and no stack trace', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);

    expect(response.body).toEqual(expect.objectContaining({ statusCode: 404 }));
    expect(response.text).not.toMatch(/\bat .+\.(?:js|ts):\d+/);
  });
});
