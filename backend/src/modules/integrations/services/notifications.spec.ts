import { randomUUID } from 'node:crypto';
import {
  IntegrationSchema,
  NotificationChannelSchema,
  NotificationEventInfoSchema,
  NotificationEventTypeSchema,
  NotificationSchema,
  type Notification,
} from '@tbn/contracts';
import { start_fake_webhook_server, type FakeWebhookServer } from '@/testing/fake_webhook_server';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';
import { COMMON_PLACEHOLDERS, NOTIFICATION_EVENTS } from './notification_events';
import { NotificationService } from './notification.service';
import { render_template } from './template_renderer';

describe('notifications', () => {
  let team: TeamHarness;
  let webhook: FakeWebhookServer;
  let integration_id: string;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  async function notifications(query: Record<string, string> = {}): Promise<Notification[]> {
    return NotificationSchema.array().parse(
      (await team.api().get('/notifications').query(query).set(auth()).expect(200)).body,
    );
  }

  beforeAll(async () => {
    team = await start_team_harness();
    webhook = await start_fake_webhook_server();
    integration_id = IntegrationSchema.parse(
      (
        await team
          .api()
          .post('/integrations')
          .set(auth())
          .send({
            name: 'Pager',
            method: 'POST',
            url: `${webhook.base_url}/notify`,
            body_format: 'json',
            body_template: '{"text": "{{body}}", "event": "{{event}}", "title": "{{title}}"}',
            placeholders: [
              { name: 'body', description: 'The rendered body', required: true },
              { name: 'event', description: 'The event type', required: false },
              { name: 'title', description: 'The title', required: false },
            ],
          })
          .expect(201)
      ).body,
    ).id;
  });

  afterAll(async () => {
    await team.close();
    await webhook.close();
  });

  it('documents every event type, whose default body renders with its placeholders', async () => {
    const catalogue = NotificationEventInfoSchema.array().parse(
      (await team.api().get('/notification_events').set(auth()).expect(200)).body,
    );
    expect(catalogue.map((entry) => entry.event_type).sort()).toEqual(
      [...NotificationEventTypeSchema.options].sort(),
    );
    for (const entry of catalogue) {
      const values = Object.fromEntries(
        entry.placeholders.map((item) => [item.name, `<${item.name}>`]),
      );
      const rendered = render_template(entry.default_body, values, 'raw');
      expect(rendered).not.toContain('{{');
      for (const common of COMMON_PLACEHOLDERS) expect(rendered).toContain(`<${common.name}>`);
      expect(NOTIFICATION_EVENTS[entry.event_type].description.length).toBeGreaterThan(10);
    }
    await team.api().get('/notification_events').expect(401);
  });

  it('sends an event through its channel with the default body, and with an override', async () => {
    const channel = NotificationChannelSchema.parse(
      (
        await team
          .api()
          .post('/notification_channels')
          .set(auth())
          .send({ event_type: 'run_failed', integration_id })
          .expect(201)
      ).body,
    );
    await team
      .api()
      .post('/notification_channels')
      .set(auth())
      .send({ event_type: 'run_failed', integration_id: randomUUID() })
      .expect(404);
    await team.api().get('/notification_channels').expect(401);

    const service = team.worker.get(NotificationService);
    const [emitted] = await service.emit(team.owner.owner_id, {
      event_type: 'run_failed',
      title: 'Alice failed',
      message: 'Alice stopped with an error on "Research".',
      priority: 'high',
      values: { agent_name: 'Alice', task_title: 'Research', error: 'boom' },
    });
    expect(emitted).toMatchObject({ status: 'pending', channel_id: channel.id, integration_id });
    const sent = await wait_for('the notification to be sent', async () => {
      const rows = await notifications({ event_type: 'run_failed' });
      const row = rows.find((item) => item.id === emitted?.id);
      return row?.status === 'sent' ? row : undefined;
    });
    expect(sent).toMatchObject({ attempts: 1, response_status: 200, error: null });
    expect(sent.sent_at).not.toBeNull();
    const received = webhook.requests.at(-1);
    expect(received?.url).toBe('/notify');
    const payload: unknown = JSON.parse(received?.body ?? '{}');
    expect(payload).toMatchObject({ event: 'run_failed', title: 'Alice failed' });
    expect(payload).toHaveProperty('text', expect.stringContaining('[high] Alice failed'));
    expect(payload).toHaveProperty('text', expect.stringContaining('Alice stopped with an error'));

    const overridden = NotificationChannelSchema.parse(
      (
        await team
          .api()
          .patch(`/notification_channels/${channel.id}`)
          .set(auth())
          .send({ body_template: 'ALERT {{agent_name}} on {{task_title}}: {{error}}' })
          .expect(200)
      ).body,
    );
    expect(overridden.body_template).toContain('ALERT');
    const [second] = await service.emit(team.owner.owner_id, {
      event_type: 'run_failed',
      title: 'Bob failed',
      message: 'Bob stopped.',
      priority: 'normal',
      values: { agent_name: 'Bob', task_title: 'Writing', error: 'crash' },
    });
    await wait_for('the second notification to be sent', async () => {
      const rows = await notifications({ status: 'sent' });
      return rows.some((item) => item.id === second?.id) ? true : undefined;
    });
    const body: unknown = JSON.parse(webhook.requests.at(-1)?.body ?? '{}');
    expect(body).toHaveProperty('text', 'ALERT Bob on Writing: crash');

    const quiet = await service.emit(team.owner.owner_id, {
      event_type: 'backup_failed',
      title: 'No channel',
      message: 'Logged only.',
      priority: 'normal',
      values: { error: 'none' },
    });
    expect(quiet[0]).toMatchObject({ status: 'sent', channel_id: null, attempts: 0 });
    expect(webhook.requests).toHaveLength(2);

    await team.api().delete(`/notification_channels/${channel.id}`).set(auth()).expect(204);
    await team.api().delete(`/notification_channels/${channel.id}`).set(auth()).expect(404);
  });

  it('records a failed attempt and succeeds on the retry', async () => {
    const channel = NotificationChannelSchema.parse(
      (
        await team
          .api()
          .post('/notification_channels')
          .set(auth())
          .send({ event_type: 'disk_nearly_full', integration_id, enabled: true })
          .expect(201)
      ).body,
    );
    const service = team.worker.get(NotificationService);
    webhook.answer_with(503);
    const [row] = await service.emit(team.owner.owner_id, {
      event_type: 'disk_nearly_full',
      title: 'Disk 95%',
      message: 'The volume is nearly full.',
      priority: 'high',
      values: { used_percent: '95' },
    });
    if (row === undefined) throw new Error('No notification');
    const failed = await wait_for('the first attempt to fail', async () => {
      const found = (await notifications({ event_type: 'disk_nearly_full' })).find(
        (item) => item.id === row.id,
      );
      return found?.status === 'failed' ? found : undefined;
    });
    expect(failed).toMatchObject({ attempts: 1, response_status: 503, channel_id: channel.id });
    expect(failed.error).toContain('"ok":false');

    webhook.answer_with(0);
    await service.deliver({ owner_id: team.owner.owner_id, notification_id: row.id });
    const sent = (await notifications({ event_type: 'disk_nearly_full' })).find(
      (item) => item.id === row.id,
    );
    expect(sent).toMatchObject({ status: 'sent', attempts: 2, response_status: 200, error: null });
    await service.deliver({ owner_id: team.owner.owner_id, notification_id: row.id });
    expect(
      (await notifications({ event_type: 'disk_nearly_full' })).find((item) => item.id === row.id)
        ?.attempts,
    ).toBe(2);
    await team.api().get('/notifications').expect(401);
  });
});
