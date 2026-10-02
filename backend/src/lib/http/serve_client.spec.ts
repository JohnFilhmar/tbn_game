import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { create_test_web_app, load_test_config } from '@/testing/test_app';

const PAGE = '<!doctype html><html><body><div id="root"></div></body></html>';

describe('the client under /app', () => {
  let client_dir: string;
  let app: NestExpressApplication;
  let bare: NestExpressApplication;

  beforeAll(async () => {
    client_dir = await mkdtemp(join(tmpdir(), 'tbn-client-'));
    await mkdir(join(client_dir, 'assets'));
    await writeFile(join(client_dir, 'index.html'), PAGE);
    await writeFile(join(client_dir, 'assets', 'index-0f3a9c.js'), 'console.log(1);');
    await writeFile(join(client_dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const config = load_test_config();
    app = await create_test_web_app({ ...config, web: { ...config.web, client_dir } });
    bare = await create_test_web_app(config);
  });

  afterAll(async () => {
    await app.close();
    await bare.close();
    await rm(client_dir, { recursive: true, force: true });
  });

  it('serves the page at /app/ and at any deep link, never cached', async () => {
    for (const path of ['/app/', '/app/agents/0f3a9c', '/app/sign_in']) {
      const response = await request(app.getHttpServer()).get(path).expect(200);
      expect(response.text).toBe(PAGE);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
    }
    await request(app.getHttpServer()).get('/').expect(302).expect('Location', '/app/');
  });

  it('serves hashed assets as immutable and other files without caching', async () => {
    const asset = await request(app.getHttpServer()).get('/app/assets/index-0f3a9c.js').expect(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    await request(app.getHttpServer()).get('/app/assets/missing.js').expect(404);
    const icon = await request(app.getHttpServer()).get('/app/favicon.svg').expect(200);
    expect(icon.headers['cache-control']).toBe('no-cache');
  });

  it('leaves the API as it was', async () => {
    await request(app.getHttpServer()).get('/agents').expect(401);
    await request(app.getHttpServer()).post('/app/').send({}).expect(404);
    const health = await request(app.getHttpServer()).get('/health').expect(200);
    expect(health.headers['content-type']).toContain('application/json');
  });

  it('serves nothing without CLIENT_DIR', async () => {
    await request(bare.getHttpServer()).get('/app/').expect(404);
    await request(bare.getHttpServer()).get('/').expect(404);
  });
});
