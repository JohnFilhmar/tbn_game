import { randomUUID } from 'node:crypto';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import { questions_to_answer } from './questions';

function entry(
  seq: number,
  run_id: string | null,
  kind: TranscriptEntryRecord['kind'],
  content: unknown,
): TranscriptEntryRecord {
  return {
    id: `entry-${seq}`,
    owner_id: 'owner',
    agent_id: 'editor',
    run_id,
    seq,
    kind,
    content,
    created_at: new Date(),
  };
}

// The transcript schema wants UUIDs; one per letter keeps the fixtures readable.
const ids = new Map<string, string>();
function id_of(letter: string): string {
  const id = ids.get(letter) ?? randomUUID();
  ids.set(letter, id);
  return id;
}
const ask = (from: string, name: string, kind = 'question') => ({
  from_agent_id: id_of(from),
  from_name: name,
  kind,
  text: 'Can you?',
});
const reply = (text: string) => ({ blocks: [{ type: 'text', text }] });
const message_to = (to: string) => ({
  blocks: [
    {
      type: 'tool_use',
      id: 'c1',
      name: 'send_message',
      input: { to, kind: 'answer', text: 'Yes' },
    },
  ],
});

describe('questions a run owes an answer', () => {
  it('owes the askers since the previous run, once each, and nothing for other kinds', () => {
    const entries = [
      entry(1, 'old', 'agent_message', ask('a', 'Ada')),
      entry(2, 'old', 'assistant', reply('Answered before.')),
      entry(3, null, 'agent_message', ask('b', 'Bo')),
      entry(4, null, 'agent_message', ask('c', 'Cy', 'finding')),
      entry(5, 'now', 'agent_message', ask('b', 'Bo')),
      entry(6, 'now', 'agent_message', ask('d', 'Di', 'answer')),
      entry(7, 'now', 'assistant', reply('Yes.')),
    ];
    expect(questions_to_answer(entries, 'now')).toEqual([{ agent_id: id_of('b'), name: 'Bo' }]);
  });

  it('owes nothing to an asker the run already answered with send_message', () => {
    const entries = [
      entry(1, null, 'agent_message', ask('b', 'Bo')),
      entry(2, 'now', 'assistant', message_to('bo')),
      entry(3, 'now', 'assistant', reply('Done.')),
    ];
    expect(questions_to_answer(entries, 'now')).toEqual([]);
  });
});
