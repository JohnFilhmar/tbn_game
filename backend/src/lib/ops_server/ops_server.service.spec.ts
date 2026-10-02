import { Test, type TestingModule } from '@nestjs/testing';
import { HealthResponseSchema } from '@tbn/contracts';
import request from 'supertest';
import { load_test_config } from '@/testing/test_app';
import { WorkerModule } from '@/worker.module';
import { OpsServerService } from './ops_server.service';

async function start_worker(): Promise<{ context: TestingModule; base_url: string }> {
  const module_ref = await Test.createTestingModule({
    imports: [WorkerModule.register(load_test_config())],
  }).compile();
  const context = await module_ref.init();
  const port = context.get(OpsServerService).port;
  return { context, base_url: `http://127.0.0.1:${port}` };
}

describe('OpsServerService on the worker process', () => {
  let context: TestingModule;
  let base_url: string;

  beforeAll(async () => {
    ({ context, base_url } = await start_worker());
  });

  afterAll(async () => {
    await context.close();
  });

  it('serves GET /health with the health contract', async () => {
    const response = await request(base_url).get('/health').expect(200);

    expect(HealthResponseSchema.parse(response.body)).toMatchObject({
      status: 'ok',
      process_type: 'worker',
      checks: { database: 'ok' },
    });
  });

  it('serves GET /metrics labelled with the worker process type', async () => {
    const response = await request(base_url).get('/metrics').expect(200);

    expect(response.text).toContain('process_type="worker"');
  });

  it('answers 404 for other paths and 405 for other methods', async () => {
    await request(base_url).get('/tasks').expect(404);
    await request(base_url).post('/health').expect(405);
  });

  it('stops listening when the context closes', async () => {
    const worker = await start_worker();
    await request(worker.base_url).get('/health').expect(200);

    await worker.context.close();

    await expect(fetch(`${worker.base_url}/health`)).rejects.toThrow();
  });
});
