import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { create_test_web_app, load_test_config } from '@/testing/test_app';

describe('GET /metrics on the web process', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers without credentials in the Prometheus text format', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.text).toMatch(/^tbn_build_info\{commit_sha="[^"]+",process_type="web"\} 1$/m);
    expect(response.text).toContain('process_cpu_user_seconds_total{process_type="web"}');
  });
});
