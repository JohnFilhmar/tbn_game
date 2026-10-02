import { RunSchema } from '@tbn/contracts';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request } from '@/testing/fake_requests';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { TEST_INTERN_MODEL, TEST_PRIMARY_MODEL } from '@/testing/test_company';
import { wait_for } from '@/testing/wait_for';

const BlockSchema = z.looseObject({
  type: z.string(),
  id: z.string().optional(),
  tool_use_id: z.string().optional(),
});

const BodySchema = z.looseObject({
  model: z.string(),
  system: z.union([z.string(), z.array(z.looseObject({ text: z.string() }))]),
  tools: z.array(z.unknown()).optional(),
  messages: z.array(
    z.looseObject({ role: z.string(), content: z.union([z.string(), z.array(BlockSchema)]) }),
  ),
});

type Body = z.infer<typeof BodySchema>;

function blocks_of(message: Body['messages'][number]): Array<z.infer<typeof BlockSchema>> {
  return typeof message.content === 'string' ? [] : message.content;
}

/** True when every tool result answers a tool call of the message right before it. */
function tool_results_follow_their_calls(body: Body): boolean {
  return body.messages.every((message, index) => {
    const results = blocks_of(message).filter((block) => block.type === 'tool_result');
    if (results.length === 0) return true;
    const previous = body.messages[index - 1];
    if (previous?.role !== 'assistant') return false;
    const calls = new Set(
      blocks_of(previous)
        .filter((block) => block.type === 'tool_use')
        .map((block) => block.id),
    );
    return results.every((result) => calls.has(result.tool_use_id));
  });
}

const PAGE = `${'A line of the long notes the agent keeps reading. '.repeat(60)}\n`;

describe('compaction', () => {
  let team: TeamHarness;

  beforeAll(async () => {
    team = await start_team_harness();
  });

  afterAll(async () => {
    await team.close();
  });

  it('folds a long session into a summary by the intern model and keeps every tool result after its call', async () => {
    const fake = await team.fake('anthropic_messages');
    let turns = 0;
    fake.respond((recorded): ScriptedReply => {
      const view = read_request(recorded, 'anthropic_messages');
      if (view.system.startsWith('You compress')) {
        return { type: 'text', text: 'SUMMARY: you wrote notes/long.md and read it back.' };
      }
      turns += 1;
      if (turns === 1) {
        return {
          type: 'tool_use',
          name: 'write_file',
          input: { path: 'notes/long.md', content: PAGE },
        };
      }
      if (view.user_texts.some((text) => text.includes('SUMMARY:')) || turns > 12) {
        return finish_reply('Read the notes enough times.');
      }
      return { type: 'tool_use', name: 'read_file', input: { path: 'notes/long.md' } };
    });
    const key = await team.provider(fake, {
      models: [
        { model_id: TEST_PRIMARY_MODEL, cost_tier: 'premium', context_window_tokens: 8_000 },
        { model_id: TEST_INTERN_MODEL, cost_tier: 'cheap' },
      ],
    });
    const agent = await team.manager(key);
    const task = await team.assign(agent, 'Read the notes', 'Write the notes, then reread them.');
    await team.wait_for_task(task.id, 'done');

    const bodies = fake.requests.map((recorded) => BodySchema.parse(recorded.body));
    const summary_requests = bodies.filter((body) => body.model === TEST_INTERN_MODEL);
    expect(summary_requests).toHaveLength(1);
    expect(summary_requests[0]?.tools ?? []).toEqual([]);
    expect(bodies.every(tool_results_follow_their_calls)).toBe(true);

    const views = fake.requests.map((recorded) => read_request(recorded, 'anthropic_messages'));
    const after = views.findIndex((view) =>
      view.user_texts.some((text) => text.includes('SUMMARY:')),
    );
    expect(after).toBeGreaterThan(0);
    const compacted = views[after];
    expect(compacted?.user_texts[0]).toBe(
      'Summary of your earlier work in this session:\nSUMMARY: you wrote notes/long.md and read it back.',
    );
    expect(compacted?.user_texts.join('\n')).not.toContain('Write the notes, then reread them.');
    expect(views[0]?.user_texts.join('\n')).toContain('Write the notes, then reread them.');

    const transcript = await team.transcript(agent.id);
    const compaction = transcript.find((entry) => entry.kind === 'compaction');
    expect(compaction?.content).toMatchObject({
      summary: 'SUMMARY: you wrote notes/long.md and read it back.',
    });
    expect(transcript.filter((entry) => entry.kind === 'task_assignment')).toHaveLength(1);
    expect(transcript.filter((entry) => entry.kind === 'tool_result').length).toBeGreaterThan(2);
  });

  it('pauses instead of summarising while a window that counts the intern model is at its limit', async () => {
    const fake = await team.fake('anthropic_messages');
    let turns = 0;
    fake.respond((): ScriptedReply => {
      turns += 1;
      return turns === 1
        ? { type: 'tool_use', name: 'write_file', input: { path: 'notes/full.md', content: PAGE } }
        : { type: 'tool_use', name: 'read_file', input: { path: 'notes/full.md' } };
    });
    const key = await team.provider(fake, {
      models: [
        { model_id: TEST_PRIMARY_MODEL, cost_tier: 'premium', context_window_tokens: 8_000 },
        { model_id: TEST_INTERN_MODEL, cost_tier: 'cheap' },
      ],
    });
    const agent = await team.manager(key);
    await team
      .api()
      .post(`/providers/${key.id}/cap_windows`)
      .set('Authorization', `Bearer ${team.owner.token}`)
      .send({
        name: 'Cheap model',
        length_count: 1,
        length_unit: 'day',
        reset_mode: 'rolling',
        unit: 'requests',
        limit: 1,
        enforced: true,
        model_id: TEST_INTERN_MODEL,
      })
      .expect(201);
    await team.app.get(PrismaService).usageRecord.create({
      data: {
        owner_id: team.owner.owner_id,
        provider_id: key.id,
        agent_id: agent.id,
        model_id: TEST_INTERN_MODEL,
        input_tokens: 10,
        output_tokens: 1,
      },
    });

    const task = await team.assign(agent, 'Read until full', 'Write the notes, then reread them.');
    const run = await wait_for('the run to pause', async () => {
      const [found] = await team.runs(agent.id);
      return found?.status === 'paused' ? RunSchema.parse(found) : undefined;
    });
    expect(run.pause_reason).toBe('cap_limit');
    const blocked = await team.task(task.id);
    expect(blocked.status).toBe('blocked');
    expect(blocked.status_reason).toContain('Cap window Cheap model');
    const models = fake.requests.map((recorded) => BodySchema.parse(recorded.body).model);
    expect(models).not.toContain(TEST_INTERN_MODEL);
    expect((await team.transcript(agent.id)).some((entry) => entry.kind === 'compaction')).toBe(
      false,
    );
  });
});
