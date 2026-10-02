import { randomUUID } from 'node:crypto';
import { ApprovalSchema, PluginSchema, PluginToolSchema, RunSourceSchema } from '@tbn/contracts';
import { z } from 'zod';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import { start_fake_mcp_server, type FakeMcpServer } from '@/testing/fake_mcp_server';
import { finish_reply, read_request } from '@/testing/fake_requests';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';

const WireSchema = z.looseObject({
  tools: z.array(z.looseObject({ name: z.string(), input_schema: z.record(z.string(), z.json()) })),
});

function tool(name: string, input: Record<string, unknown>): ScriptedReply {
  return { type: 'tool_use', name, input };
}

describe('plugins', () => {
  let team: TeamHarness;
  let mcp: FakeMcpServer;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  beforeAll(async () => {
    team = await start_team_harness();
    mcp = await start_fake_mcp_server();
  });

  afterAll(async () => {
    await team.close();
    await mcp.close();
  });

  it('registers a plugin, lists its tools, and never returns the token', async () => {
    await team.api().get('/plugins').expect(401);
    const plugin = PluginSchema.parse(
      (
        await team
          .api()
          .post('/plugins')
          .set(auth())
          .send({ name: 'echoer', url: mcp.url, token: mcp.token })
          .expect(201)
      ).body,
    );
    expect(plugin).toMatchObject({ name: 'echoer', token_set: true, enabled: true });
    await team
      .api()
      .post('/plugins')
      .set(auth())
      .send({ name: 'echoer', url: mcp.url })
      .expect(409);
    await team
      .api()
      .post('/plugins')
      .set(auth())
      .send({ name: 'Bad Name', url: mcp.url })
      .expect(400);
    const tools = PluginToolSchema.array().parse(
      (await team.api().post(`/plugins/${plugin.id}/tools`).set(auth()).expect(200)).body,
    );
    expect(tools.map((item) => item.name)).toEqual(['echo']);
    expect(tools[0]?.input_schema).toMatchObject({ type: 'object' });
    expect(JSON.stringify([plugin, tools])).not.toContain(mcp.token);

    const wrong = PluginSchema.parse(
      (
        await team
          .api()
          .post('/plugins')
          .set(auth())
          .send({ name: 'wrong_token', url: mcp.url, token: 'not-it' })
          .expect(201)
      ).body,
    );
    await team.api().post(`/plugins/${wrong.id}/tools`).set(auth()).expect(503);
    await team.api().delete(`/plugins/${wrong.id}`).set(auth()).expect(204);
    await team.api().get(`/plugins/${randomUUID()}`).set(auth()).expect(404);
  });

  it('offers an attached plugin tool, which needs approval, taints the run and keeps the token in the worker', async () => {
    const plugins = PluginSchema.array().parse(
      (await team.api().get('/plugins').set(auth()).expect(200)).body,
    );
    const plugin = plugins.find((item) => item.name === 'echoer');
    if (plugin === undefined) throw new Error('No plugin');
    const dead = PluginSchema.parse(
      (
        await team
          .api()
          .post('/plugins')
          .set(auth())
          .send({ name: 'unreachable', url: 'http://127.0.0.1:9/mcp' })
          .expect(201)
      ).body,
    );

    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => {
      const results = read_request(request, 'anthropic_messages').tool_results;
      if (results.length === 0) return tool('plugin_echoer__echo', { text: 'hello', shout: true });
      return finish_reply(`The plugin said ${results[0] ?? ''}`);
    });
    const manager = await team.manager(await team.provider(fake));
    await team.api().post(`/agents/${manager.id}/plugins/${plugin.id}`).set(auth()).expect(201);
    await team.api().post(`/agents/${manager.id}/plugins/${dead.id}`).set(auth()).expect(201);
    await team.api().post(`/agents/${manager.id}/plugins/${randomUUID()}`).set(auth()).expect(404);
    const task = await team.assign(manager, 'Use the plugin');

    const approval = await wait_for('the plugin call to wait for the owner', async () => {
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
    expect(approval).toMatchObject({
      tool_name: 'plugin_echoer__echo',
      payload: { text: 'hello', shout: true },
    });
    const first = WireSchema.parse(fake.requests[0]?.body);
    const offered = first.tools.find((item) => item.name === 'plugin_echoer__echo');
    expect(offered?.input_schema).toMatchObject({ type: 'object' });
    expect(JSON.stringify(offered?.input_schema)).toContain('shout');
    expect(first.tools.some((item) => item.name.startsWith('plugin_unreachable__'))).toBe(false);

    await team.api().post(`/approvals/${approval.id}/approve`).set(auth()).expect(200);
    const done = await team.wait_for_task(task.id, 'done');
    expect(done.result).toBe('The plugin said HELLO');
    expect(mcp.calls).toHaveLength(1);
    expect(mcp.calls[0]?.authorization).toBe(`Bearer ${mcp.token}`);

    const transcript = await team.transcript(manager.id);
    const text = JSON.stringify(transcript);
    expect(text).toContain('The plugin unreachable did not answer');
    expect(text).not.toContain(mcp.token);
    expect(JSON.stringify(fake.requests.map((item) => item.body))).not.toContain(mcp.token);

    const [run] = await team.runs(manager.id);
    expect(run?.tainted_at).not.toBeNull();
    const sources = RunSourceSchema.array().parse(
      (
        await team
          .api()
          .get(`/runs/${run?.id ?? ''}/sources`)
          .set(auth())
          .expect(200)
      ).body,
    );
    expect(sources).toMatchObject([{ kind: 'plugin', reference: 'plugin_echoer__echo' }]);

    await team.api().delete(`/agents/${manager.id}/plugins/${plugin.id}`).set(auth()).expect(204);
    await team.api().delete(`/agents/${manager.id}/plugins/${plugin.id}`).set(auth()).expect(404);
  });
});
