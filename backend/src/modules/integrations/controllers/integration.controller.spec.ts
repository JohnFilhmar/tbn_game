import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  AgentAttachmentsSchema,
  IntegrationCallResultSchema,
  IntegrationSchema,
  type Integration,
} from '@tbn/contracts';
import request from 'supertest';
import { PrismaService } from '@/lib/database/prisma.service';
import { start_fake_webhook_server, type FakeWebhookServer } from '@/testing/fake_webhook_server';
import { LogCapture } from '@/testing/log_capture';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';

const TOKEN = 'leakcanary-token-aaaa';

describe('integration routes', () => {
  const logs = new LogCapture();
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let webhook: FakeWebhookServer;
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
    webhook = await start_fake_webhook_server();
  });

  afterAll(async () => {
    await webhook.close();
    await app.close();
  });

  function body_for(name: string): Record<string, unknown> {
    return {
      name,
      method: 'POST',
      url: `${webhook.base_url}/hooks/{{channel}}?from={{sender}}`,
      headers: { Authorization: 'Bearer {{token}}', 'X-Sender': '{{sender}}' },
      token: TOKEN,
      body_format: 'json',
      body_template: '{"text": "{{text}}", "channel": "{{channel}}"}',
      placeholders: [
        { name: 'text', description: 'The message', required: true },
        { name: 'channel', description: 'The channel', required: true },
        { name: 'sender', description: 'Who sends it', required: false },
      ],
    };
  }

  it('needs a token on every route', async () => {
    await api().get('/integrations').expect(401);
    await api().post('/integrations').send(body_for('x')).expect(401);
  });

  it('creates, lists, updates, tests and deletes an integration without ever returning the token', async () => {
    const created = IntegrationSchema.parse(
      (await api().post('/integrations').set(auth()).send(body_for('Slack')).expect(201)).body,
    );
    expect(created).toMatchObject({ name: 'Slack', token_set: true, body_format: 'json' });
    expect(created.placeholders).toHaveLength(3);

    const listed = IntegrationSchema.array().parse(
      (await api().get('/integrations').set(auth()).expect(200)).body,
    );
    expect(listed.map((row) => row.name)).toEqual(['Slack']);
    expect(
      (await api().get('/integrations').set('Authorization', `Bearer ${other.token}`)).body,
    ).toEqual([]);
    await api().get(`/integrations/${created.id}`).set(auth()).expect(200);
    await api().get(`/integrations/${randomUUID()}`).set(auth()).expect(404);
    await api().post('/integrations').set(auth()).send(body_for('Slack')).expect(409);

    const hostile = 'say "hi" \\ and\nmore & more=x';
    const result = IntegrationCallResultSchema.parse(
      (
        await api()
          .post(`/integrations/${created.id}/test`)
          .set(auth())
          .send({ values: { text: hostile, channel: 'gen eral', sender: 'a&b' } })
          .expect(200)
      ).body,
    );
    expect(result.status).toBe(200);
    expect(result.excerpt).toContain('"ok":true');
    const seen = webhook.requests.at(-1);
    expect(seen?.method).toBe('POST');
    expect(seen?.url).toBe('/hooks/gen%20eral?from=a%26b');
    expect(seen?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(seen?.headers['x-sender']).toBe('a&b');
    expect(seen?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen?.body ?? '{}')).toEqual({ text: hostile, channel: 'gen eral' });

    await api()
      .post(`/integrations/${created.id}/test`)
      .set(auth())
      .send({ values: { text: 'no channel' } })
      .expect(400);

    const updated = IntegrationSchema.parse(
      (
        await api()
          .patch(`/integrations/${created.id}`)
          .set(auth())
          .send({ body_format: 'form', body_template: 'text={{text}}&channel={{channel}}' })
          .expect(200)
      ).body,
    );
    expect(updated.body_format).toBe('form');
    await api()
      .post(`/integrations/${created.id}/test`)
      .set(auth())
      .send({ values: { text: 'a=b&c', channel: 'x' } })
      .expect(200);
    const form = webhook.requests.at(-1);
    expect(form?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(form?.body ?? '').get('text')).toBe('a=b&c');

    const stored = await app
      .get(PrismaService)
      .integration.findFirst({ where: { id: created.id } });
    expect(stored?.token_ciphertext).not.toBeNull();
    expect(stored?.token_ciphertext).not.toContain(TOKEN);
    expect(JSON.stringify([created, listed, updated, result])).not.toContain(TOKEN);
    expect(logs.text).not.toContain(TOKEN);

    await api().delete(`/integrations/${created.id}`).set(auth()).expect(204);
    await api().delete(`/integrations/${created.id}`).set(auth()).expect(404);
  });

  it('rejects an unknown placeholder and a bad placeholder name when the template is saved', async () => {
    const unknown = await api()
      .post('/integrations')
      .set(auth())
      .send({ ...body_for('Bad'), body_template: '{"text": "{{nope}}"}' })
      .expect(400);
    expect(JSON.stringify(unknown.body)).toContain('unknown placeholder {{nope}}');
    await api()
      .post('/integrations')
      .set(auth())
      .send({
        ...body_for('Bad'),
        placeholders: [{ name: 'Not-Valid', description: 'x', required: true }],
      })
      .expect(400);
    await api()
      .post('/integrations')
      .set(auth())
      .send({
        ...body_for('Bad'),
        placeholders: [
          { name: 'text', description: 'x', required: true },
          { name: 'text', description: 'y', required: true },
          { name: 'channel', description: 'z', required: true },
        ],
      })
      .expect(400);
    const good: Integration = IntegrationSchema.parse(
      (await api().post('/integrations').set(auth()).send(body_for('Good')).expect(201)).body,
    );
    const patched = await api()
      .patch(`/integrations/${good.id}`)
      .set(auth())
      .send({ url: `${webhook.base_url}/{{mystery}}` })
      .expect(400);
    expect(JSON.stringify(patched.body)).toContain('unknown placeholder {{mystery}}');
  });

  it('attaches an integration to an agent and takes it away', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const integration = IntegrationSchema.parse(
      (await api().post('/integrations').set(auth()).send(body_for('Attached')).expect(201)).body,
    );
    await api().post(`/agents/${agent.id}/integrations/${integration.id}`).expect(401);
    await api().post(`/agents/${agent.id}/integrations/${integration.id}`).set(auth()).expect(201);
    await api().post(`/agents/${agent.id}/integrations/${integration.id}`).set(auth()).expect(201);
    await api()
      .post(`/agents/${randomUUID()}/integrations/${integration.id}`)
      .set(auth())
      .expect(404);
    await api().post(`/agents/${agent.id}/integrations/${randomUUID()}`).set(auth()).expect(404);
    await api().get(`/agents/${agent.id}/attachments`).expect(401);
    expect(
      AgentAttachmentsSchema.parse(
        (await api().get(`/agents/${agent.id}/attachments`).set(auth()).expect(200)).body,
      ),
    ).toEqual({ agent_id: agent.id, integration_ids: [integration.id], plugin_ids: [] });
    await api().get(`/agents/${randomUUID()}/attachments`).set(auth()).expect(404);
    await api()
      .get(`/agents/${agent.id}/attachments`)
      .set({ Authorization: `Bearer ${other.token}` })
      .expect(404);
    await api()
      .delete(`/agents/${agent.id}/integrations/${integration.id}`)
      .set(auth())
      .expect(204);
    await api()
      .delete(`/agents/${agent.id}/integrations/${integration.id}`)
      .set(auth())
      .expect(404);
    expect(
      AgentAttachmentsSchema.parse(
        (await api().get(`/agents/${agent.id}/attachments`).set(auth()).expect(200)).body,
      ).integration_ids,
    ).toEqual([]);
  });
});
