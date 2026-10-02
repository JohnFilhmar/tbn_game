import { ApprovalSchema, IntegrationSchema } from '@tbn/contracts';
import { z } from 'zod';
import { SandboxJobService } from '@/modules/runtime/services/sandbox/sandbox_job.service';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request } from '@/testing/fake_requests';
import { start_fake_webhook_server, type FakeWebhookServer } from '@/testing/fake_webhook_server';
import { load_test_config } from '@/testing/test_app';
import {
  launcher_test_config,
  prepare_test_sandbox,
  start_test_launcher,
} from '@/testing/test_launcher';
import {
  ALLOWED_HOST,
  start_test_proxy,
  start_test_upstream,
  type TestProxy,
  type TestUpstream,
} from '@/testing/test_proxy';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';

const TOKEN = 'secret-LEAKCANARY-token';

const WireSchema = z.looseObject({ tools: z.array(z.looseObject({ name: z.string() })) });

function tool(name: string, input: Record<string, unknown>): ScriptedReply {
  return { type: 'tool_use', name, input };
}

describe('outward tools in tainted runs', () => {
  let upstream: TestUpstream;
  let proxy: TestProxy;
  let webhook: FakeWebhookServer;
  let team: TeamHarness;
  let launcher: Awaited<ReturnType<typeof start_test_launcher>>;
  let integration_id: string;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  beforeAll(async () => {
    upstream = await start_test_upstream();
    proxy = await start_test_proxy(load_test_config(), upstream);
    webhook = await start_fake_webhook_server();
    team = await start_team_harness((config) =>
      launcher_test_config({ ...config, egress: { ...config.egress, url: proxy.url } }),
    );
    await prepare_test_sandbox(team.config);
    launcher = await start_test_launcher(team.config);
    integration_id = IntegrationSchema.parse(
      (
        await team
          .api()
          .post('/integrations')
          .set(auth())
          .send({
            name: 'Ticket Desk',
            method: 'POST',
            url: `${webhook.base_url}/tickets`,
            headers: { Authorization: 'Bearer {{token}}' },
            token: TOKEN,
            body_format: 'json',
            body_template: '{"summary": "{{summary}}"}',
            placeholders: [{ name: 'summary', description: 'The ticket summary', required: true }],
          })
          .expect(201)
      ).body,
    ).id;
  }, 300_000);

  afterAll(async () => {
    await launcher.close();
    await team.close();
    await webhook.close();
    await proxy.close();
    await upstream.close();
  });

  it('runs an integration directly in a clean run under policy auto, but asks in a tainted run', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => {
      const results = read_request(request, 'anthropic_messages').tool_results;
      if (results.length === 0) return tool('call_ticket_desk', { summary: 'clean call' });
      if (results.length === 1) return tool('fetch_url', { url: `http://${ALLOWED_HOST}/page` });
      if (results.length === 2) return tool('call_ticket_desk', { summary: 'tainted call' });
      return finish_reply('Both calls done.');
    });
    const manager = await team.manager(await team.provider(fake), {
      tool_policy: { call_ticket_desk: 'auto' },
    });
    await team
      .api()
      .post(`/agents/${manager.id}/integrations/${integration_id}`)
      .set(auth())
      .expect(201);
    const task = await team.assign(manager, 'Open tickets');

    const approval = await wait_for('the tainted call to wait for the owner', async () => {
      const rows = ApprovalSchema.array().parse(
        (
          await team
            .api()
            .get('/approvals')
            .query({ status: 'pending', agent_id: manager.id })
            .set(auth())
            .expect(200)
        ).body,
      );
      return rows[0];
    });
    expect(webhook.requests).toHaveLength(1);
    expect(JSON.parse(webhook.requests[0]?.body ?? '{}')).toEqual({ summary: 'clean call' });
    expect(webhook.requests[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(approval).toMatchObject({
      tool_name: 'call_ticket_desk',
      payload: { summary: 'tainted call' },
      sources: [{ kind: 'fetch', reference: `http://${ALLOWED_HOST}/page` }],
    });
    expect(approval.preview).toContain('POST');
    expect(approval.preview).toContain('Authorization: Bearer [redacted]');
    expect(approval.preview).toContain('"summary": "tainted call"');
    expect(approval.preview).not.toContain(TOKEN);
    await team.wait_for_pause(manager.id, 'awaiting_approval');

    await team.api().post(`/approvals/${approval.id}/approve`).set(auth()).expect(200);
    const done = await team.wait_for_task(task.id, 'done');
    expect(done.status).toBe('done');
    expect(webhook.requests).toHaveLength(2);
    expect(JSON.parse(webhook.requests[1]?.body ?? '{}')).toEqual({ summary: 'tainted call' });

    const first = WireSchema.parse(fake.requests[0]?.body);
    expect(first.tools.map((item) => item.name)).toContain('call_ticket_desk');
    expect(JSON.stringify(fake.requests.map((item) => item.body))).not.toContain(TOKEN);
    expect(JSON.stringify(await team.transcript(manager.id))).not.toContain(TOKEN);
    const last = fake.requests.at(-1);
    if (last === undefined) throw new Error('No request');
    const results = read_request(last, 'anthropic_messages').tool_results;
    expect(results[0]).toContain('HTTP 200');
    expect(results[0]).not.toContain('Authorization');
  });

  it('denies the tainted call with the owner note, and the sandbox never holds the token', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => {
      const results = read_request(request, 'anthropic_messages').tool_results;
      if (results.length === 0) return tool('fetch_url', { url: `http://${ALLOWED_HOST}/page` });
      if (results.length === 1) return tool('call_ticket_desk', { summary: 'denied call' });
      return finish_reply(`Outcome: ${results[1] ?? ''}`);
    });
    const manager = await team.manager(await team.provider(fake), {
      tool_policy: { call_ticket_desk: 'auto' },
    });
    await team
      .api()
      .post(`/agents/${manager.id}/integrations/${integration_id}`)
      .set(auth())
      .expect(201);
    const task = await team.assign(manager, 'Open a denied ticket');
    const approval = await wait_for('the call to wait for the owner', async () => {
      const rows = ApprovalSchema.array().parse(
        (
          await team
            .api()
            .get('/approvals')
            .query({ status: 'pending', agent_id: manager.id })
            .set(auth())
            .expect(200)
        ).body,
      );
      return rows[0];
    });
    await team
      .api()
      .post(`/approvals/${approval.id}/deny`)
      .set(auth())
      .send({ note: 'Not from a web page' })
      .expect(200);
    const done = await team.wait_for_task(task.id, 'done');
    expect(done.result).toBe('Outcome: The owner denied this call: Not from a web page');
    expect(webhook.requests.filter((item) => item.body.includes('denied call'))).toHaveLength(0);

    const jobs = team.worker.get(SandboxJobService);
    const agent = { ...manager, owner_id: team.owner.owner_id };
    const [run] = await team.runs(manager.id);
    const job = await jobs.run_for_agent(
      {
        run_id: run?.id ?? '',
        agent: {
          ...agent,
          appearance: {},
          tool_policy: {},
          created_at: new Date(),
          updated_at: new Date(),
          idle_since: null,
          active_run_id: null,
        },
      },
      'env',
    );
    expect(job.status).toBe('done');
    expect(job.stdout).toContain('HTTPS_PROXY=');
    expect(job.stdout).not.toContain(TOKEN);
    expect(job.stdout).not.toContain('SECRETS_ENCRYPTION_KEY');
    expect(job.stdout).not.toContain('DATABASE_URL');
  });
});
