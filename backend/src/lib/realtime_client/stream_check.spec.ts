import { randomUUID } from 'node:crypto';
import type { ChangeEvent, StreamChunk } from '@tbn/contracts';
import { stored_reply_text, streamed_replies } from './stream_check';

const AGENT = randomUUID();
const RUN = randomUUID();
const AT = '2026-10-02T12:00:00.000Z';

function chunk(call_id: string, overrides: Partial<StreamChunk>): StreamChunk {
  return {
    agent_id: AGENT,
    run_id: RUN,
    call_id,
    after_seq: 3,
    attempt: 1,
    index: 0,
    text: '',
    done: false,
    ...overrides,
  };
}

function assistant(seq: number, entry_seq: number, texts: string[]): ChangeEvent {
  const id = randomUUID();
  return {
    seq,
    entity: 'transcript_entry',
    id,
    op: 'insert',
    changed: null,
    data: {
      id,
      agent_id: AGENT,
      run_id: RUN,
      seq: entry_seq,
      created_at: AT,
      kind: 'assistant',
      content: {
        blocks: [
          ...texts.map((text) => ({ type: 'text' as const, text })),
          { type: 'tool_use' as const, id: 'toolu_1', name: 'list_roster', input: {} },
        ],
      },
    },
    at: AT,
  };
}

describe('streamed_replies', () => {
  it('keeps the last attempt of a call and marks it complete once done arrives', () => {
    const call = randomUUID();
    const replies = streamed_replies([
      chunk(call, { attempt: 1, index: 0, text: 'Lost ' }),
      chunk(call, { attempt: 1, index: 1, text: '', done: true }),
      chunk(call, { attempt: 2, index: 0, text: 'Hello ' }),
      chunk(call, { attempt: 2, index: 1, text: 'there.', done: true }),
    ]);
    expect(replies).toEqual([
      expect.objectContaining({ call_id: call, attempt: 2, text: 'Hello there.', complete: true }),
    ]);
  });

  it('marks a reply with a missing chunk or without its end incomplete', () => {
    const gap = randomUUID();
    const open = randomUUID();
    const replies = streamed_replies([
      chunk(gap, { index: 0, text: 'A' }),
      chunk(gap, { index: 2, text: 'C', done: true }),
      chunk(open, { after_seq: 5, index: 0, text: 'Still going' }),
    ]);
    expect(replies.map((reply) => reply.complete)).toEqual([false, false]);
  });

  it('keeps only the last call that began after the same entry of a run', () => {
    const failed = randomUUID();
    const resumed = randomUUID();
    const replies = streamed_replies([
      chunk(failed, { text: 'Half', done: true }),
      chunk(resumed, { text: 'Whole', done: true }),
    ]);
    expect(replies.map((reply) => reply.call_id)).toEqual([resumed]);
  });
});

describe('stored_reply_text', () => {
  it('reads the text of the first assistant entry after the call began', () => {
    const reply = streamed_replies([chunk(randomUUID(), { text: 'One two', done: true })])[0];
    if (reply === undefined) throw new Error('No reply');
    expect(stored_reply_text([assistant(1, 2, ['Old'])], reply)).toBeNull();
    expect(
      stored_reply_text([assistant(2, 6, ['Later']), assistant(3, 4, ['One ', 'two'])], reply),
    ).toBe('One two');
  });
});
