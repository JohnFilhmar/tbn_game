import { CapWindowStatusSchema, ReportSchema, type Agent } from '@tbn/contracts';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import { WorkerSweepService } from '@/modules/runtime/services/worker_sweep.service';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import {
  finish_reply,
  read_request,
  subtask_results_seen,
  type RequestView,
} from '@/testing/fake_requests';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';

/** An intern writes a file for its task, then finishes it. */
function intern_reply(view: RequestView): ScriptedReply {
  if (view.last.startsWith('Wrote ')) return finish_reply(`Finished: ${view.agent_name ?? ''}`);
  return {
    type: 'tool_use',
    name: 'write_file',
    input: { path: `team/${Date.now()}.md`, content: 'A short part.\n' },
  };
}

function delegate(input: Record<string, string>): ScriptedReply {
  return {
    type: 'tool_use',
    name: 'delegate_task',
    input: { title: 'Part', instructions: 'Write one part of the guide.', ...input },
  };
}

const WAIT: ScriptedReply = { type: 'text', text: 'Waiting for the subtask reports.' };

describe('a manager and its team', () => {
  let team: TeamHarness;

  beforeAll(async () => {
    team = await start_team_harness();
  });

  afterAll(async () => {
    await team.close();
  });

  it('spawns, reuses, switches to the local provider past a threshold, and returns one condensed report', async () => {
    const cloud = await team.fake('anthropic_messages');
    const local_fake = await team.fake('openai_chat_completions');
    const cloud_key = await team.provider(cloud);
    const local_key = await team.provider(local_fake, { is_local: true });
    const manager: Agent = await team.manager(cloud_key, { role: 'Tea editor' });
    const first_intern = `${manager.name} intern 1`;

    const window_response = await team
      .api()
      .post(`/providers/${cloud_key.id}/cap_windows`)
      .set('Authorization', `Bearer ${team.owner.token}`)
      .send({
        name: 'Hourly',
        length_count: 1,
        length_unit: 'hour',
        reset_mode: 'rolling',
        unit: 'requests',
        limit: 16,
        threshold_percent: 50,
        enforced: true,
      })
      .expect(201);
    const window = CapWindowStatusSchema.parse(window_response.body);

    cloud.respond((recorded) => {
      const view = read_request(recorded, 'anthropic_messages');
      if (view.agent_name !== manager.name) return intern_reply(view);
      const results = subtask_results_seen(view);
      const delegations = view.tool_results.filter((text) => text.startsWith('Delegated task'));
      if (!view.tool_results.some((text) => text.includes('"agents"'))) {
        return { type: 'tool_use', name: 'list_roster', input: {} };
      }
      if (delegations.length === 0) {
        return delegate({
          title: 'Green tea',
          new_intern_role: 'Researcher',
          new_intern_job_description: 'Looks things up.',
        });
      }
      if (results === 1 && delegations.length === 1) {
        return delegate({ title: 'Black tea', intern_name: first_intern });
      }
      if (results === 2 && delegations.length === 2) {
        return delegate({
          title: 'Herbal tea',
          new_intern_role: 'Writer',
          new_intern_job_description: 'Writes short pages.',
        });
      }
      if (results === 3) {
        return {
          type: 'tool_use',
          name: 'finish_task',
          input: {
            outcome: 'The tea guide is done in three parts.',
            what_was_done: 'Two interns wrote the parts; the first one twice.',
            decisions: 'Moved the last part to the local model once the key passed its threshold.',
            open_questions: 'None.',
          },
        };
      }
      return WAIT;
    });
    local_fake.respond((recorded) =>
      intern_reply(read_request(recorded, 'openai_chat_completions')),
    );

    const goal = await team.assign(manager, 'Tea guide', 'Write a three part tea guide.');
    const done = await team.wait_for_task(goal.id, 'done', 60_000);

    const subtasks = await team.tasks({ parent_task_id: goal.id });
    expect(subtasks.map((task) => [task.title, task.status])).toEqual([
      ['Green tea', 'done'],
      ['Black tea', 'done'],
      ['Herbal tea', 'done'],
    ]);
    const interns = await team.agents({ department_id: manager.department_id, level: '2' });
    expect(
      interns.map((intern) => [intern.name, intern.provider_id, intern.primary_model]),
    ).toEqual([
      [first_intern, cloud_key.id, manager.intern_model],
      [`${manager.name} intern 2`, local_key.id, 'test-intern'],
    ]);
    expect(subtasks[0]?.assignee_agent_id).toBe(interns[0]?.id);
    expect(subtasks[1]?.assignee_agent_id).toBe(interns[0]?.id);
    expect(subtasks[2]?.assignee_agent_id).toBe(interns[1]?.id);

    const report = ReportSchema.parse(
      (
        await team
          .api()
          .get(`/reports/${done.report_id ?? ''}`)
          .set('Authorization', `Bearer ${team.owner.token}`)
          .expect(200)
      ).body,
    );
    expect(report.body_md).toContain('## Outcome\n\nThe tea guide is done in three parts.');
    expect(report.body_md).toContain(`- Green tea: done, by ${first_intern} (report `);
    expect(report.body_md).toContain(`- Herbal tea: done, by ${manager.name} intern 2 (report `);
    expect(report.body_md).toContain('This task and its 3 subtasks.');
    const requests_line = /- Requests: (\d+)/.exec(report.body_md)?.[1];
    expect(Number(requests_line)).toBe(cloud.requests.length + local_fake.requests.length);

    const windows = CapWindowStatusSchema.array().parse(
      (
        await team
          .api()
          .get(`/providers/${cloud_key.id}/cap_windows`)
          .set('Authorization', `Bearer ${team.owner.token}`)
          .expect(200)
      ).body,
    );
    expect(windows.find((item) => item.id === window.id)?.state).toBe('past_threshold');

    await team.app.get(PreferenceService).set(team.owner.owner_id, 'intern_idle_ttl_minutes', 0.01);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await team.worker.get(WorkerSweepService).sweep();
    const after = await team.agents({ department_id: manager.department_id });
    expect(after.map((agent) => [agent.level, agent.status])).toEqual([
      [1, 'idle'],
      [2, 'terminated'],
      [2, 'terminated'],
    ]);
  });

  it('waits for its subtasks instead of being nudged, and cannot finish before they report', async () => {
    const fake = await team.fake('anthropic_messages');
    const key = await team.provider(fake);
    const manager = await team.manager(key);
    let early_finish_refused = false;
    fake.respond((recorded) => {
      const view = read_request(recorded, 'anthropic_messages');
      if (view.agent_name !== manager.name) {
        const reply = intern_reply(view);
        return reply.type === 'tool_use' && reply.name === 'write_file'
          ? { ...reply, delay_ms: 1_500 }
          : reply;
      }
      if (subtask_results_seen(view) === 1) return finish_reply('Both halves are in.');
      if (view.tool_results.some((text) => text.includes('still open'))) {
        early_finish_refused = true;
        return WAIT;
      }
      if (view.tool_results.some((text) => text.startsWith('Delegated task'))) {
        return finish_reply('Too early.');
      }
      return delegate({ new_intern_role: 'Helper', new_intern_job_description: 'Helps.' });
    });

    const goal = await team.assign(manager, 'Half and half');
    await wait_for('the manager to wait', async () => {
      const [run] = await team.runs(manager.id);
      return run?.status === 'paused' && run.pause_reason === 'waiting_on_subtasks'
        ? run
        : undefined;
    });
    expect(await team.task(goal.id)).toMatchObject({
      status: 'in_progress',
      status_reason: 'Waiting for 1 subtask.',
    });
    await team.wait_for_task(goal.id, 'done');
    expect(early_finish_refused).toBe(true);
    const notes = (await team.transcript(manager.id)).filter(
      (entry) => entry.kind === 'system_note',
    );
    expect(notes).toEqual([]);
    expect((await team.task(goal.id)).status_reason).toBeNull();
  });

  it("refuses a manager's report that does not fit on one screen", async () => {
    const fake = await team.fake('openai_chat_completions');
    const key = await team.provider(fake);
    const manager = await team.manager(key);
    fake.respond((recorded) => {
      const view = read_request(recorded, 'openai_chat_completions');
      return view.tool_results.some((text) => text.includes('fit on one screen'))
        ? finish_reply('Short now.')
        : finish_reply('x'.repeat(2_500));
    });
    const goal = await team.assign(manager, 'Long report');
    const done = await team.wait_for_task(goal.id, 'done');
    expect(done.result).toBe('Short now.');
    expect(fake.requests).toHaveLength(2);
  });

  it('wakes an idle manager with a question from another one and answers it in a run of its own', async () => {
    const fake = await team.fake('anthropic_messages');
    const key = await team.provider(fake);
    const asker = await team.manager(key, { role: 'Planner' });
    const editor = await team.manager(key, { role: 'Editor' });
    fake.respond((recorded) => {
      const view = read_request(recorded, 'anthropic_messages');
      if (view.agent_name === editor.name) return { type: 'text', text: 'Yes, by Friday.' };
      if (view.tool_results.some((text) => text.startsWith('Delivered your question'))) {
        return finish_reply('Asked the editor.');
      }
      return {
        type: 'tool_use',
        name: 'send_message',
        input: { to: editor.name, kind: 'question', text: 'Can the review be done by Friday?' },
      };
    });

    const task = await team.assign(asker, 'Ask about the review');
    await team.wait_for_task(task.id, 'done');
    const answer = await wait_for('the editor to answer', async () => {
      const entries = await team.transcript(editor.id);
      return entries.some((entry) => entry.kind === 'assistant') ? entries : undefined;
    });
    expect(answer.map((entry) => entry.kind)).toEqual(['agent_message', 'assistant']);
    const [run] = await team.runs(editor.id);
    expect(run?.task_id).toBeNull();
    const asked = fake.requests
      .map((recorded) => read_request(recorded, 'anthropic_messages'))
      .find((view) => view.agent_name === editor.name);
    expect(asked?.last).toBe(
      `Message from ${asker.name} (question):\nCan the review be done by Friday?`,
    );
  });
});
