import { randomUUID } from 'node:crypto';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import {
  last_assistant_text,
  pending_tool_calls,
  transcript_to_messages,
} from '@/modules/runtime/services/transcript/transcript_messages';

function entry(
  seq: number,
  kind: TranscriptEntryRecord['kind'],
  content: unknown,
): TranscriptEntryRecord {
  return {
    id: `entry-${seq}`,
    owner_id: 'owner',
    agent_id: 'agent',
    run_id: 'run',
    seq,
    kind,
    content,
    created_at: new Date(),
  };
}

const call = { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.md' } };
const task_id = randomUUID();

describe('transcript messages', () => {
  it('renders every kind and merges consecutive entries on the same side', () => {
    const messages = transcript_to_messages([
      entry(1, 'task_assignment', { task_id, title: 'Write', instructions: 'A haiku.' }),
      entry(2, 'owner_message', { text: 'Make it short.' }),
      entry(3, 'assistant', { blocks: [{ type: 'text', text: 'Checking notes.' }, call] }),
      entry(4, 'tool_result', {
        results: [{ tool_use_id: 'call_1', name: 'read_file', content: 'notes', is_error: false }],
      }),
      entry(5, 'system_note', { text: 'Carry on.' }),
      entry(6, 'assistant', { blocks: [] }),
      entry(7, 'assistant', { blocks: [{ type: 'text', text: 'Done.' }] }),
      entry(8, 'owner_message', 'not an object'),
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'New task: Write\n\nA haiku.\n\nCall finish_task when it is complete, or decline_task if it is not yours to do.',
          },
          { type: 'text', text: 'Message from the owner:\nMake it short.' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Checking notes.' }, call] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: 'notes', is_error: false },
          { type: 'text', text: 'Note from the system: Carry on.' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    ]);
  });

  it('finds the unanswered tool calls of the last assistant turn', () => {
    const answered = [
      entry(1, 'assistant', { blocks: [call] }),
      entry(2, 'tool_result', {
        results: [{ tool_use_id: 'call_1', name: 'read_file', content: 'x', is_error: false }],
      }),
    ];
    expect(pending_tool_calls(answered)).toEqual([]);
    expect(
      pending_tool_calls([entry(1, 'assistant', { blocks: [{ type: 'text', text: 'hi' }, call] })]),
    ).toEqual([call]);
    expect(pending_tool_calls([])).toEqual([]);
  });

  it('returns the last assistant text', () => {
    expect(
      last_assistant_text([
        entry(1, 'assistant', { blocks: [{ type: 'text', text: 'first' }] }),
        entry(2, 'assistant', { blocks: [call] }),
        entry(3, 'tool_result', { results: [] }),
      ]),
    ).toBe('first');
    expect(last_assistant_text([entry(1, 'owner_message', { text: 'hi' })])).toBe('');
  });

  it('renders messages from agents and subtask results', () => {
    const subtask_id = randomUUID();
    const messages = transcript_to_messages([
      entry(1, 'agent_message', {
        from_agent_id: randomUUID(),
        from_name: 'grace',
        kind: 'question',
        text: 'Which sources?',
      }),
      entry(2, 'subtask_result', {
        task_id: subtask_id,
        title: 'Find sources',
        assignee_agent_id: randomUUID(),
        assignee_name: 'ada intern 1',
        status: 'done',
        result: 'Three sources.',
        report_id: null,
        report_md: '# Find sources\n\nThree sources.',
      }),
      entry(3, 'subtask_result', {
        task_id: randomUUID(),
        title: 'Draft',
        assignee_agent_id: randomUUID(),
        assignee_name: 'ada intern 2',
        status: 'failed',
        result: 'Gave up.',
        report_id: null,
        report_md: null,
      }),
    ]);
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Message from grace (question):\nWhich sources?\n\n(Answer in plain text: your reply goes back to grace.)',
          },
          {
            type: 'text',
            text: 'Subtask done: "Find sources" by ada intern 1.\n\n# Find sources\n\nThree sources.',
          },
          { type: 'text', text: 'Subtask failed: "Draft" by ada intern 2.\n\nGave up.' },
        ],
      },
    ]);
  });

  it('puts tool results ahead of a message that landed between the call and its result', () => {
    const messages = transcript_to_messages([
      entry(1, 'assistant', { blocks: [call] }),
      entry(2, 'owner_message', { text: 'Hurry up.' }),
      entry(3, 'tool_result', {
        results: [{ tool_use_id: 'call_1', name: 'read_file', content: 'notes', is_error: false }],
      }),
    ]);
    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_1', content: 'notes', is_error: false },
        { type: 'text', text: 'Message from the owner:\nHurry up.' },
      ],
    });
  });

  it('starts with the summary and shortens long tool results', () => {
    const messages = transcript_to_messages(
      [
        entry(5, 'assistant', { blocks: [call] }),
        entry(6, 'tool_result', {
          results: [
            { tool_use_id: 'call_1', name: 'read_file', content: 'x'.repeat(50), is_error: false },
          ],
        }),
      ],
      { summary: 'You wrote two drafts.', max_tool_result_chars: 10 },
    );
    expect(messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Summary of your earlier work in this session:\nYou wrote two drafts.',
        },
      ],
    });
    const result = messages[2]?.content[0];
    expect(result?.type === 'tool_result' ? result.content : '').toMatch(
      /^x{10}\n\.\.\. shortened/,
    );
  });

  it('replays a write_file call by its path and size, not the content it wrote', () => {
    const long = {
      type: 'tool_use',
      id: 'w1',
      name: 'write_file',
      input: { path: 'r.md', content: 'y'.repeat(5_000) },
    };
    const short = {
      type: 'tool_use',
      id: 'w2',
      name: 'write_file',
      input: { path: 's.md', content: 'tiny' },
    };
    const messages = transcript_to_messages([entry(1, 'assistant', { blocks: [long, short] })]);
    const [first, second] = messages[0]?.content ?? [];
    expect(first?.type === 'tool_use' ? first.input : {}).toEqual({
      path: 'r.md',
      content: '(5000 characters written; read_file shows them)',
    });
    expect(second?.type === 'tool_use' ? second.input : {}).toEqual({
      path: 's.md',
      content: 'tiny',
    });
  });
});
