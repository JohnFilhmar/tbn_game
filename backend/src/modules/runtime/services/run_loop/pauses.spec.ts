import { ProviderSchema, RunSchema } from '@tbn/contracts';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import { WorkerSweepService } from '@/modules/runtime/services/worker_sweep.service';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request, type RequestView } from '@/testing/fake_requests';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';

/** Writes a file for the task, then finishes it. */
function writer_reply(view: RequestView): ScriptedReply {
  if (view.last.startsWith('Wrote ')) return finish_reply('Written.');
  return {
    type: 'tool_use',
    name: 'write_file',
    input: { path: `pauses/${Date.now()}.md`, content: 'text\n' },
  };
}

describe('paused runs', () => {
  let team: TeamHarness;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  beforeAll(async () => {
    team = await start_team_harness((config) => ({
      ...config,
      providers: { ...config.providers, breaker_threshold: 2, breaker_cooldown_seconds: 2 },
    }));
  });

  afterAll(async () => {
    await team.close();
  });

  async function paused_run(agent_id: string) {
    return wait_for(`a paused run of agent ${agent_id}`, async () => {
      const [run] = await team.runs(agent_id);
      return run?.status === 'paused' ? run : undefined;
    });
  }

  it('the runaway guard pauses a looping run; the owner continues it, then stops it', async () => {
    const preferences = team.app.get(PreferenceService);
    await preferences.set(team.owner.owner_id, 'runaway_guard_turns', 3);
    const fake = await team.fake('anthropic_messages');
    fake.respond(() => ({ type: 'tool_use', name: 'list_files', input: { path: '.' } }));
    const manager = await team.manager(await team.provider(fake));
    const task = await team.assign(manager, 'Loop forever');

    const run = await paused_run(manager.id);
    expect(run.pause_reason).toBe('runaway_guard');
    expect(fake.requests).toHaveLength(3);
    const awaiting = await team.task(task.id);
    expect(awaiting.status).toBe('awaiting_approval');
    expect(awaiting.status_reason).toContain('3 model turns');

    await team.api().post(`/runs/${run.id}/continue`).expect(401);
    const continued = await team.api().post(`/runs/${run.id}/continue`).set(auth()).expect(200);
    expect(RunSchema.parse(continued.body)).toMatchObject({
      status: 'running',
      pause_reason: null,
    });
    await wait_for('the guard to trip again', () => (fake.requests.length >= 6 ? true : undefined));
    const again = await paused_run(manager.id);
    expect(again.id).toBe(run.id);
    expect(fake.requests).toHaveLength(6);

    await team.api().post(`/runs/${run.id}/stop`).expect(401);
    const stopped = await team.api().post(`/runs/${run.id}/stop`).set(auth()).expect(200);
    expect(RunSchema.parse(stopped.body).status).toBe('cancelled');
    expect((await team.task(task.id)).status).toBe('cancelled');
    expect(await team.agent(manager.id)).toMatchObject({ status: 'idle', active_run_id: null });
    await team.api().post(`/runs/${run.id}/continue`).set(auth()).expect(409);
    await team.api().post(`/runs/${run.id}/stop`).set(auth()).expect(409);
    await team.api().post(`/runs/${manager.id}/continue`).set(auth()).expect(404);
    await preferences.set(team.owner.owner_id, 'runaway_guard_turns', 50);
  });

  it('blocks a manager at the limit of a fixed window and resumes it when the window resets', async () => {
    const fake = await team.fake('openai_chat_completions');
    fake.respond((recorded) => writer_reply(read_request(recorded, 'openai_chat_completions')));
    const key = await team.provider(fake);
    const manager = await team.manager(key);
    const anchor = new Date(Date.now() + 6_000);
    await team
      .api()
      .post(`/providers/${key.id}/cap_windows`)
      .set(auth())
      .send({
        name: 'Hourly',
        length_count: 1,
        length_unit: 'hour',
        reset_mode: 'fixed',
        anchor_at: anchor.toISOString(),
        unit: 'requests',
        limit: 1,
        enforced: true,
      })
      .expect(201);

    const task = await team.assign(manager, 'One call per window');
    const blocked = await team.wait_for_task(task.id, 'blocked');
    expect(blocked.status_reason).toContain('Hourly');
    const run = await paused_run(manager.id);
    expect(run).toMatchObject({ pause_reason: 'cap_limit', resume_at: anchor.toISOString() });
    expect(fake.requests).toHaveLength(1);

    const done = await team.wait_for_task(task.id, 'done', 40_000);
    expect(done.status_reason).toBeNull();
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.received_at).toBeGreaterThanOrEqual(anchor.getTime());
  });

  it('never stops a call on a display-only window far past its limit', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond((recorded) => writer_reply(read_request(recorded, 'anthropic_messages')));
    const key = await team.provider(fake);
    const manager = await team.manager(key);
    await team
      .api()
      .post(`/providers/${key.id}/cap_windows`)
      .set(auth())
      .send({
        name: 'Display only',
        length_count: 1,
        length_unit: 'day',
        reset_mode: 'rolling',
        unit: 'requests',
        limit: 1,
      })
      .expect(201);
    const first = await team.assign(manager, 'First');
    await team.wait_for_task(first.id, 'done');
    const second = await team.assign(manager, 'Second');
    await team.wait_for_task(second.id, 'done');
    expect(fake.requests).toHaveLength(4);
    const runs = await team.runs(manager.id);
    expect(runs.every((run) => run.pause_reason === null)).toBe(true);
  });

  it('pauses runs while a provider keeps failing and resumes them after the cooldown, never failing them', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.enqueue({ type: 'status', status: 503 });
    fake.enqueue({ type: 'status', status: 503 });
    fake.respond((recorded) => writer_reply(read_request(recorded, 'anthropic_messages')));
    const key = await team.provider(fake);
    const manager = await team.manager(key);
    const task = await team.assign(manager, 'Flaky provider');

    const run = await paused_run(manager.id);
    expect(run.pause_reason).toBe('breaker_open');
    expect((await team.task(task.id)).status).toBe('blocked');
    await wait_for('the breaker to open', async () => {
      const provider = ProviderSchema.parse(
        (await team.api().get(`/providers/${key.id}`).set(auth()).expect(200)).body,
      );
      return provider.breaker_open_until !== null ? provider : undefined;
    });

    await team.wait_for_task(task.id, 'done', 40_000);
    expect(fake.requests.length).toBe(4);
    const [finished] = await team.runs(manager.id);
    expect(finished?.status).toBe('done');
    const provider = ProviderSchema.parse(
      (await team.api().get(`/providers/${key.id}`).set(auth()).expect(200)).body,
    );
    expect(provider.breaker_open_until).toBeNull();
  });

  it('blocks every task on a key out of credit and resumes them from their checkpoints after a new key', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.enqueue({
      type: 'tool_use',
      name: 'write_file',
      input: { path: 'credit/first.md', content: 'first\n' },
    });
    fake.enqueue({ type: 'status', status: 402 });
    fake.respond(() => finish_reply('Done after the top-up.'));
    const key = await team.provider(fake);
    const manager = await team.manager(key);
    const first = await team.assign(manager, 'Running when credit ends');
    const second = await team.assign(manager, 'Queued when credit ends');

    await team.wait_for_task(first.id, 'blocked');
    const queued_then_blocked = await team.task(second.id);
    expect(queued_then_blocked.status).toBe('blocked');
    expect(queued_then_blocked.started_at).toBeNull();
    expect(queued_then_blocked.status_reason).toContain('out of credit');
    expect((await paused_run(manager.id)).pause_reason).toBe('out_of_credit');
    const marked = ProviderSchema.parse(
      (await team.api().get(`/providers/${key.id}`).set(auth()).expect(200)).body,
    );
    expect(marked.out_of_credit_since).not.toBeNull();

    await team
      .api()
      .patch(`/providers/${key.id}`)
      .set(auth())
      .send({ api_key: 'sk-test-topped-up' })
      .expect(200);
    await team.worker.get(WorkerSweepService).sweep();
    await team.wait_for_task(first.id, 'done');
    await team.wait_for_task(second.id, 'done');

    const writes = (await team.transcript(manager.id)).filter(
      (entry) =>
        entry.kind === 'tool_result' &&
        entry.content.results.some((result) => result.name === 'write_file'),
    );
    expect(writes).toHaveLength(1);
    const resumed = read_request(
      fake.requests[2] ?? { path: '', headers: {}, body: null, received_at: 0 },
      'anthropic_messages',
    );
    expect(resumed.tool_results.some((text) => text.startsWith('Wrote '))).toBe(true);
  });

  it('keeps a provider with a parallel limit of one to one call at a time', async () => {
    const fake = await team.fake('openai_chat_completions');
    fake.respond((recorded) => ({
      ...writer_reply(read_request(recorded, 'openai_chat_completions')),
      delay_ms: 300,
    }));
    const key = await team.provider(fake, { max_parallel_requests: 1 });
    const first = await team.manager(key);
    const second = await team.manager(key);
    const tasks = await Promise.all([team.assign(first, 'One'), team.assign(second, 'Two')]);
    await Promise.all(tasks.map((task) => team.wait_for_task(task.id, 'done')));
    expect(fake.requests).toHaveLength(4);
    expect(fake.max_in_flight).toBe(1);
  });
});
