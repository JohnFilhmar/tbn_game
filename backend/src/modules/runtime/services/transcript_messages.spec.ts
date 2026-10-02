import { randomUUID } from 'node:crypto';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import {
  last_assistant_text,
  pending_tool_calls,
  transcript_to_messages,
} from './transcript_messages';

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
            text: 'New task: Write\n\nA haiku.\n\nCall finish_task when it is complete.',
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
});
