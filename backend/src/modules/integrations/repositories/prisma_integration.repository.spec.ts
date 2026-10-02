import type { NestExpressApplication } from '@nestjs/platform-express';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  INTEGRATION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  PLUGIN_REPOSITORY,
  PROCESS_INSTANCE_REPOSITORY,
  type IntegrationRepository,
  type NotificationRepository,
  type PluginRepository,
  type ProcessInstanceRepository,
} from './interface/integration_repository.interface';

describe('integration, notification, plugin and process instance repositories', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let integrations: IntegrationRepository;
  let notifications: NotificationRepository;
  let plugins: PluginRepository;
  let instances: ProcessInstanceRepository;
  let agent_id: string;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    integrations = app.get<IntegrationRepository>(INTEGRATION_REPOSITORY);
    notifications = app.get<NotificationRepository>(NOTIFICATION_REPOSITORY);
    plugins = app.get<PluginRepository>(PLUGIN_REPOSITORY);
    instances = app.get<ProcessInstanceRepository>(PROCESS_INSTANCE_REPOSITORY);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent_id = (await recruit_test_agent(app, owner.owner_id, provider.id)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps integrations, attachments, channels and notifications within the owner', async () => {
    const integration = await integrations.create(owner.owner_id, {
      name: 'hook',
      method: 'POST',
      url: 'https://hooks.example/{{id}}',
      headers: { 'X-A': '{{token}}' },
      token_ciphertext: 'sealed',
      body_format: 'json',
      body_template: '{"id": "{{id}}"}',
      placeholders: [{ name: 'id', description: 'An id', required: true }],
    });
    expect(integration.headers).toEqual({ 'X-A': '{{token}}' });
    expect(await integrations.find(other.owner_id, integration.id)).toBeNull();
    expect(await integrations.find_by_name(owner.owner_id, 'hook')).toMatchObject({
      id: integration.id,
    });
    expect(await integrations.update(other.owner_id, integration.id, { name: 'x' })).toBeNull();
    expect(
      (await integrations.update(owner.owner_id, integration.id, { headers: {}, placeholders: [] }))
        ?.placeholders,
    ).toEqual([]);

    await integrations.attach(owner.owner_id, integration.id, agent_id);
    await integrations.attach(owner.owner_id, integration.id, agent_id);
    expect(
      (await integrations.list_for_agent(owner.owner_id, agent_id)).map((row) => row.id),
    ).toEqual([integration.id]);
    expect(await integrations.list_for_agent(other.owner_id, agent_id)).toEqual([]);
    expect(await integrations.attached_ids(owner.owner_id, agent_id)).toEqual([integration.id]);
    expect(await integrations.attached_ids(other.owner_id, agent_id)).toEqual([]);
    expect(await integrations.detach(other.owner_id, integration.id, agent_id)).toBe(false);
    expect(await integrations.detach(owner.owner_id, integration.id, agent_id)).toBe(true);
    expect(await integrations.detach(owner.owner_id, integration.id, agent_id)).toBe(false);

    const channel = await notifications.create_channel(owner.owner_id, {
      event_type: 'run_failed',
      integration_id: integration.id,
      body_template: null,
      enabled: true,
    });
    expect(await notifications.find_channel(other.owner_id, channel.id)).toBeNull();
    expect(
      (await notifications.enabled_channels(owner.owner_id, 'run_failed')).map(
        (item) => item.integration.id,
      ),
    ).toEqual([integration.id]);
    expect(await notifications.enabled_channels(owner.owner_id, 'report_finished')).toEqual([]);
    expect(await notifications.owners_listening('run_failed')).toContain(owner.owner_id);
    expect(await notifications.owners_listening('run_failed')).not.toContain(other.owner_id);
    await notifications.update_channel(owner.owner_id, channel.id, { enabled: false });
    expect(await notifications.enabled_channels(owner.owner_id, 'run_failed')).toEqual([]);

    const row = await notifications.create(owner.owner_id, {
      channel_id: channel.id,
      integration_id: integration.id,
      event_type: 'run_failed',
      title: 't',
      message: 'm',
      priority: 'high',
      status: 'pending',
    });
    expect(await notifications.find(other.owner_id, row.id)).toBeNull();
    const failed = await notifications.record_attempt(owner.owner_id, row.id, {
      status: 'failed',
      response_status: 500,
      error: 'boom',
      sent_at: null,
    });
    expect(failed).toMatchObject({ status: 'failed', attempts: 1, response_status: 500 });
    const sent = await notifications.record_attempt(owner.owner_id, row.id, {
      status: 'sent',
      response_status: 200,
      error: null,
      sent_at: new Date(),
    });
    expect(sent).toMatchObject({ status: 'sent', attempts: 2, error: null });
    expect(
      await notifications.record_attempt(other.owner_id, row.id, {
        status: 'failed',
        response_status: 500,
        error: 'not yours',
        sent_at: null,
      }),
    ).toBeNull();
    expect(
      (await notifications.list(owner.owner_id, { status: 'sent' })).map((item) => item.id),
    ).toContain(row.id);
    expect(await notifications.list(other.owner_id, {})).toEqual([]);

    expect(await notifications.delete_channel(other.owner_id, channel.id)).toBe(false);
    expect(await notifications.delete_channel(owner.owner_id, channel.id)).toBe(true);
    expect((await notifications.find(owner.owner_id, row.id))?.channel_id).toBeNull();
    expect(await integrations.delete(owner.owner_id, integration.id)).toBe(true);
  });

  it('keeps plugins and their attachments within the owner, and lists enabled ones only', async () => {
    const plugin = await plugins.create(owner.owner_id, {
      name: 'mcp_one',
      url: 'http://plugin.example/mcp',
      token_ciphertext: null,
      enabled: true,
    });
    expect(await plugins.find(other.owner_id, plugin.id)).toBeNull();
    expect(await plugins.find_by_name(owner.owner_id, 'mcp_one')).toMatchObject({ id: plugin.id });
    await plugins.attach(owner.owner_id, plugin.id, agent_id);
    expect((await plugins.list_for_agent(owner.owner_id, agent_id)).map((row) => row.id)).toEqual([
      plugin.id,
    ]);
    await plugins.update(owner.owner_id, plugin.id, { enabled: false });
    expect(await plugins.list_for_agent(owner.owner_id, agent_id)).toEqual([]);
    expect(await plugins.attached_ids(owner.owner_id, agent_id)).toEqual([plugin.id]);
    expect(await plugins.attached_ids(other.owner_id, agent_id)).toEqual([]);
    expect(await plugins.detach(owner.owner_id, plugin.id, agent_id)).toBe(true);
    expect(await plugins.detach(owner.owner_id, plugin.id, agent_id)).toBe(false);
    expect(await plugins.delete(other.owner_id, plugin.id)).toBe(false);
    expect(await plugins.delete(owner.owner_id, plugin.id)).toBe(true);
  });

  it('records process boots and the ones that never stopped cleanly', async () => {
    const stopped_before = (await instances.find_unstopped('sandbox')).map((row) => row.id);
    const first = await instances.create('sandbox', 'host:1');
    const second = await instances.create('sandbox', 'host:2');
    const unstopped = (await instances.find_unstopped('sandbox')).map((row) => row.id);
    expect(unstopped).toEqual([...stopped_before, first.id, second.id]);
    await instances.mark_stopped([first.id], new Date());
    await instances.mark_stopped([], new Date());
    expect((await instances.find_unstopped('sandbox')).map((row) => row.id)).toEqual([
      ...stopped_before,
      second.id,
    ]);
    await instances.mark_stopped([...stopped_before, second.id], new Date());
    expect(await instances.find_unstopped('sandbox')).toEqual([]);
  });
});
