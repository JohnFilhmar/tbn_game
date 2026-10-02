import type { NestExpressApplication } from '@nestjs/platform-express';
import { IntegrationSchema, NotificationSchema } from '@tbn/contracts';
import request from 'supertest';
import { start_fake_webhook_server, type FakeWebhookServer } from '@/testing/fake_webhook_server';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { reset_worker_state, start_worker_process } from '@/testing/test_worker';
import { wait_for } from '@/testing/wait_for';

describe('restart detection', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let webhook: FakeWebhookServer;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${owner.token}` });

  function api(): ReturnType<typeof request> {
    return request(app.getHttpServer());
  }

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    await reset_worker_state(app);
    owner = await create_test_owner(app);
    webhook = await start_fake_webhook_server();
  });

  afterAll(async () => {
    await webhook.close();
    await app.close();
  });

  it('a worker killed with SIGKILL makes the next worker send process_restarted', async () => {
    const first = await start_worker_process({});
    const integration = IntegrationSchema.parse(
      (
        await api()
          .post('/integrations')
          .set(auth())
          .send({
            name: 'Restart pager',
            method: 'POST',
            url: `${webhook.base_url}/restart`,
            body_format: 'json',
            body_template: '{"text": "{{body}}", "process": "{{process_type}}"}',
            placeholders: [
              { name: 'body', description: 'The body', required: true },
              { name: 'process_type', description: 'The process', required: false },
            ],
          })
          .expect(201)
      ).body,
    );
    await api()
      .post('/notification_channels')
      .set(auth())
      .send({ event_type: 'process_restarted', integration_id: integration.id })
      .expect(201);
    expect(await first.stop('SIGKILL')).toBe('SIGKILL');

    const second = await start_worker_process({});
    try {
      const sent = await wait_for('the restart notification to be sent', async () => {
        const rows = NotificationSchema.array().parse(
          (
            await api()
              .get('/notifications')
              .query({ event_type: 'process_restarted' })
              .set(auth())
              .expect(200)
          ).body,
        );
        return rows.find((row) => row.status === 'sent');
      });
      expect(sent.title).toBe('The worker process restarted');
      expect(sent.message).toContain('stopped without a clean shutdown');
      const received = webhook.requests.find((item) => item.url === '/restart');
      expect(JSON.parse(received?.body ?? '{}')).toMatchObject({ process: 'worker' });
    } finally {
      expect(await second.stop('SIGTERM')).toBe(0);
    }
    const third = await start_worker_process({});
    try {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const rows = NotificationSchema.array().parse(
        (
          await api()
            .get('/notifications')
            .query({ event_type: 'process_restarted' })
            .set(auth())
            .expect(200)
        ).body,
      );
      expect(rows).toHaveLength(1);
    } finally {
      expect(await third.stop('SIGTERM')).toBe(0);
    }
  });
});
