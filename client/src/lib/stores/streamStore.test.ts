import { describe, expect, it } from 'vitest';
import { assistantEntry, chunkFixture, ownerMessage } from '@/testing/fixtures';
import { receiveChunk, settleReply, type StreamingReplies } from './streamStore';

describe('streaming replies', () => {
  it('assembles the chunks of a call and marks it done', () => {
    let replies: StreamingReplies = {};
    replies = receiveChunk(replies, chunkFixture({ index: 0, text: 'Hello ' }));
    replies = receiveChunk(replies, chunkFixture({ index: 1, text: 'there.', done: true }));
    expect(replies['agent-1']).toMatchObject({ text: 'Hello there.', done: true, afterSeq: 3 });
  });

  it('starts over when a retry begins and drops a late chunk of the failed attempt', () => {
    let replies: StreamingReplies = {};
    replies = receiveChunk(replies, chunkFixture({ attempt: 1, text: 'Half a' }));
    replies = receiveChunk(replies, chunkFixture({ attempt: 2, text: 'Whole' }));
    replies = receiveChunk(replies, chunkFixture({ attempt: 1, index: 1, text: ' sentence' }));
    expect(replies['agent-1']).toMatchObject({ attempt: 2, text: 'Whole' });
    replies = receiveChunk(replies, chunkFixture({ call_id: 'call-2', attempt: 1, text: 'Next' }));
    expect(replies['agent-1']).toMatchObject({ callId: 'call-2', text: 'Next' });
  });

  it('gives way to the stored reply, and only to the reply after the call began', () => {
    let replies = receiveChunk({}, chunkFixture({ after_seq: 3, text: 'Streaming' }));
    replies = settleReply(replies, ownerMessage('agent-1', 4, 'A note'));
    replies = settleReply(replies, assistantEntry('agent-1', 3, 'An older reply'));
    expect(replies['agent-1']?.text).toBe('Streaming');
    replies = settleReply(replies, assistantEntry('agent-1', 5, 'Streaming, stored'));
    expect(replies['agent-1']).toBeUndefined();
  });
});
