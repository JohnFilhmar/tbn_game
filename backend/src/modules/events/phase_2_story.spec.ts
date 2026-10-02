import type { AddressInfo } from 'node:net';
import { EventsPageSchema, type Agent } from '@tbn/contracts';
import { run_scripted_session } from '@/lib/realtime_client/scripted_session';
import type { FakeProviderServer, ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request } from '@/testing/fake_requests';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';

const MESSAGE = 'A note from the owner: keep every part short.';
const PARTS = 5;

/**
 * The agent checks the roster once per part, saying first what it is about to do, so each turn
 * streams text; then it finishes. Every reply streams slowly enough for the client to drop and
 * come back while the run goes on.
 */
function steps(
  fake: FakeProviderServer,
): (request: Parameters<typeof read_request>[0]) => ScriptedReply {
  return (request) => {
    const view = read_request(request, fake.api_format);
    const done = view.tool_results.length;
    if (done < PARTS) {
      return {
        type: 'tool_use',
        name: 'list_roster',
        input: {},
        text: `Working on part ${done + 1} of ${PARTS}: checking who is on the team first.`,
        delay_ms: 150,
        chunk_delay_ms: 25,
      };
    }
    return { ...finish_reply('Wrote every part.'), text: 'Every part is done, reporting now.' };
  };
}

describe('the phase 2 exit story', () => {
  let team: TeamHarness;
  let url: string;
  let fake: FakeProviderServer;
  let agent: Agent;

  beforeAll(async () => {
    team = await start_team_harness();
    await team.app.listen(0, '127.0.0.1');
    const address = team.app.getHttpServer().address();
    const port =
      typeof address === 'object' && address !== null ? (address satisfies AddressInfo).port : 0;
    url = `http://127.0.0.1:${port}`;
    fake = await team.fake('anthropic_messages');
    fake.respond(steps(fake));
    agent = await team.manager(await team.provider(fake));
  });

  afterAll(async () => {
    await team.close();
  });

  it('delivers every event once and in order across a drop, while the owner chats with the busy agent', async () => {
    const head = EventsPageSchema.parse(
      (
        await team
          .api()
          .get('/events')
          .query({ after: 0, limit: 1 })
          .set({ Authorization: `Bearer ${team.owner.token}` })
          .expect(200)
      ).body,
    ).head_seq;
    const task = await team.assign(agent, 'Write the notes', `Write ${PARTS} short parts.`);

    const lines: string[] = [];
    const result = await run_scripted_session({
      url,
      token: team.owner.token,
      agent_id: agent.id,
      task_id: task.id,
      cursor: head,
      drop_after_replies: 2,
      away_ms: 400,
      message: MESSAGE,
      timeout_ms: 30_000,
      log: (line) => lines.push(line),
    });

    expect(result.comparison).toMatchObject({ matches: true, missing: [], repeated: [] });
    expect(result.comparison.expected).toBeGreaterThan(10);
    expect(result.faults).toEqual([]);
    expect(result.resyncs).toBe(0);
    expect(result.connections).toBe(2);
    expect(result.message).toEqual({
      statuses: [201, 201],
      replayed: true,
      same_entry: true,
      stored: 1,
    });
    expect(result.task_status).toBe('done');
    expect(result.replies.checked).toBeGreaterThan(0);
    expect(result.replies.matching).toBe(result.replies.checked);
    expect(result.passed).toBe(true);

    const transcript = await team.transcript(agent.id);
    const message_at = transcript.findIndex((entry) => entry.kind === 'owner_message');
    expect(transcript.slice(0, message_at).some((entry) => entry.kind === 'assistant')).toBe(true);
    expect(transcript.slice(message_at).some((entry) => entry.kind === 'assistant')).toBe(true);
    const later = fake.requests.map((request) => read_request(request, fake.api_format));
    expect(later.some((view) => view.user_texts.some((text) => text.includes(MESSAGE)))).toBe(true);
  });
});
