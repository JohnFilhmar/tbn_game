import { randomUUID } from 'node:crypto';
import { ApprovalSchema, RunSchema, type Approval } from '@tbn/contracts';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import type { FakeProviderServer, ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request } from '@/testing/fake_requests';
import { load_test_config } from '@/testing/test_app';
import {
  ALLOWED_HOST,
  start_test_proxy,
  start_test_upstream,
  type TestProxy,
  type TestUpstream,
} from '@/testing/test_proxy';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';

function tool(name: string, input: Record<string, unknown>): ScriptedReply {
  return { type: 'tool_use', name, input };
}

/** The tool results the fake saw in its last request. */
function last_results(fake: FakeProviderServer): string[] {
  const last = fake.requests.at(-1);
  if (last === undefined) throw new Error('No request');
  return read_request(last, 'anthropic_messages').tool_results;
}

describe('the approval inbox', () => {
  let upstream: TestUpstream;
  let proxy: TestProxy;
  let team: TeamHarness;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  async function pending_approvals(agent_id: string): Promise<Approval[]> {
    return wait_for(`a pending approval of ${agent_id}`, async () => {
      const rows = ApprovalSchema.array().parse(
        (
          await team
            .api()
            .get('/approvals')
            .query({ status: 'pending', agent_id })
            .set(auth())
            .expect(200)
        ).body,
      );
      return rows.length > 0 ? rows : undefined;
    });
  }

  beforeAll(async () => {
    upstream = await start_test_upstream();
    proxy = await start_test_proxy(load_test_config(), upstream);
    team = await start_team_harness((config) => ({
      ...config,
      egress: { ...config.egress, url: proxy.url },
    }));
  });

  afterAll(async () => {
    await team.close();
    await proxy.close();
    await upstream.close();
  });

  it('holds a call whose policy is ask until the owner approves it, with what the run had read', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => {
      const results = read_request(request, 'anthropic_messages').tool_results;
      if (results.length === 0) return tool('fetch_url', { url: `http://${ALLOWED_HOST}/page` });
      if (results.length === 1) {
        return tool('write_file', { path: 'approved/note.md', content: 'approved\n' });
      }
      return finish_reply('Wrote the note after approval.');
    });
    const manager = await team.manager(await team.provider(fake), {
      tool_policy: { write_file: 'ask' },
    });
    const task = await team.assign(manager, 'Write with approval');

    const [approval] = await pending_approvals(manager.id);
    if (approval === undefined) throw new Error('No approval');
    expect(approval).toMatchObject({
      kind: 'tool_call',
      tool_name: 'write_file',
      agent_id: manager.id,
      task_id: task.id,
      payload: { path: 'approved/note.md', content: 'approved\n' },
      sources: [{ kind: 'fetch', reference: `http://${ALLOWED_HOST}/page`, cached: false }],
    });
    const [run] = await team.runs(manager.id);
    expect(run).toMatchObject({ status: 'paused', pause_reason: 'awaiting_approval' });
    const waiting = await team.task(task.id);
    expect(waiting.status).toBe('awaiting_approval');
    expect(waiting.status_reason).toContain('write_file');
    const requests_before = fake.requests.length;

    await team.api().post(`/approvals/${approval.id}/approve`).expect(401);
    const approved = ApprovalSchema.parse(
      (
        await team
          .api()
          .post(`/approvals/${approval.id}/approve`)
          .set(auth())
          .send({ note: 'Go ahead' })
          .expect(200)
      ).body,
    );
    expect(approved).toMatchObject({ status: 'approved', note: 'Go ahead' });
    await team.wait_for_task(task.id, 'done');
    expect(fake.requests.length).toBe(requests_before + 1);
    const results = last_results(fake);
    expect(results[1]).toMatch(/^Wrote \d+ bytes to approved\/note\.md/);
    await team.api().post(`/approvals/${approval.id}/approve`).set(auth()).expect(409);
    await team.api().post(`/approvals/${approval.id}/deny`).set(auth()).expect(409);
    await team.api().get(`/approvals/${approval.id}`).set(auth()).expect(200);
    await team.api().get(`/approvals/${randomUUID()}`).set(auth()).expect(404);
    await team.api().get('/approvals').expect(401);
  });

  it('answers the model with the denial and the note when the owner denies', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => {
      const results = read_request(request, 'anthropic_messages').tool_results;
      if (results.length === 0) {
        return tool('write_file', { path: 'denied/note.md', content: 'denied\n' });
      }
      return finish_reply(`The call was ${results[0] ?? ''}`);
    });
    const manager = await team.manager(await team.provider(fake), {
      tool_policy: { write_file: 'ask' },
    });
    const task = await team.assign(manager, 'Write without approval');
    const [approval] = await pending_approvals(manager.id);
    if (approval === undefined) throw new Error('No approval');
    await team
      .api()
      .post(`/approvals/${approval.id}/deny`)
      .set(auth())
      .send({ note: 'Not that file' })
      .expect(200);
    const done = await team.wait_for_task(task.id, 'done');
    expect(done.result).toContain('The owner denied this call: Not that file');
    expect(last_results(fake)[0]).toBe('The owner denied this call: Not that file');
  });

  it('puts the runaway guard in the inbox, where approving continues and denying stops', async () => {
    const preferences = team.app.get(PreferenceService);
    await preferences.set(team.owner.owner_id, 'runaway_guard_turns', 3);
    try {
      const fake = await team.fake('anthropic_messages');
      fake.respond(() => tool('list_files', { path: '.' }));
      const manager = await team.manager(await team.provider(fake));
      const task = await team.assign(manager, 'Loop');
      const [guard] = await pending_approvals(manager.id);
      if (guard === undefined) throw new Error('No guard approval');
      expect(guard).toMatchObject({ kind: 'runaway_guard', tool_name: null, task_id: task.id });
      expect(guard.payload).toMatchObject({ guard_turns: 3 });
      const [run] = await team.runs(manager.id);
      expect(run?.pause_reason).toBe('runaway_guard');

      await team.api().post(`/approvals/${guard.id}/approve`).set(auth()).expect(200);
      await wait_for('the guard to trip again', () =>
        fake.requests.length >= 6 ? true : undefined,
      );
      const [second] = await pending_approvals(manager.id);
      if (second === undefined) throw new Error('No second guard approval');
      expect(second.id).not.toBe(guard.id);

      const stopped = await team
        .api()
        .post(`/runs/${run?.id ?? ''}/stop`)
        .set(auth())
        .expect(200);
      expect(RunSchema.parse(stopped.body).status).toBe('cancelled');
      expect(
        ApprovalSchema.parse(
          (await team.api().get(`/approvals/${second.id}`).set(auth()).expect(200)).body,
        ),
      ).toMatchObject({ status: 'denied', note: 'The owner stopped the run' });
      expect((await team.task(task.id)).status).toBe('cancelled');
    } finally {
      await preferences.set(team.owner.owner_id, 'runaway_guard_turns', 50);
    }
  });
});
