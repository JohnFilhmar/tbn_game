import type { StreamChunk } from '@tbn/contracts';
import { STREAM_TEXT_MAX_BYTES, type StreamNotice } from './channels';
import { ModelStream, split_utf8, type StreamTarget } from './stream_publisher.service';

const TARGET: StreamTarget = {
  owner_id: '00000000-0000-4000-8000-000000000001',
  agent_id: '00000000-0000-4000-8000-000000000002',
  run_id: '00000000-0000-4000-8000-000000000003',
  after_seq: 7,
};

function open(): { stream: ModelStream; chunks: StreamChunk[] } {
  const chunks: StreamChunk[] = [];
  const stream = new ModelStream(TARGET, (notice: StreamNotice) => {
    chunks.push(notice.chunk);
    return Promise.resolve();
  });
  return { stream, chunks };
}

describe('split_utf8', () => {
  it('keeps every piece within the byte limit and never splits a character', () => {
    const text = 'añb€c😀d'.repeat(20);
    const pieces = split_utf8(text, 4);
    expect(pieces.join('')).toBe(text);
    for (const piece of pieces) {
      expect(Buffer.byteLength(piece)).toBeLessThanOrEqual(4);
      expect(piece).toBe(Buffer.from(piece, 'utf8').toString('utf8'));
      expect(piece).not.toContain('�');
    }
  });

  it('returns nothing for empty text', () => {
    expect(split_utf8('', 10)).toEqual([]);
  });
});

describe('a model stream', () => {
  it('gathers text that arrives together into one chunk and marks the last one done', async () => {
    const { stream, chunks } = open();
    stream.text('Hello ', 1);
    stream.text('there', 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    stream.text('.', 1);
    await stream.close();
    expect(chunks).toEqual([
      {
        agent_id: TARGET.agent_id,
        run_id: TARGET.run_id,
        call_id: chunks[0]?.call_id,
        after_seq: 7,
        attempt: 1,
        index: 0,
        text: 'Hello there',
        done: false,
      },
      {
        agent_id: TARGET.agent_id,
        run_id: TARGET.run_id,
        call_id: chunks[0]?.call_id,
        after_seq: 7,
        attempt: 1,
        index: 1,
        text: '.',
        done: true,
      },
    ]);
  });

  it('closes an attempt when a retry starts and numbers the new one from zero', async () => {
    const { stream, chunks } = open();
    stream.text('First try', 1);
    stream.text('Second', 2);
    stream.text(' try', 2);
    await stream.close();
    expect(new Set(chunks.map((chunk) => chunk.call_id)).size).toBe(1);
    expect(
      chunks.map(({ attempt, index, text, done }) => ({ attempt, index, text, done })),
    ).toEqual([
      { attempt: 1, index: 0, text: 'First try', done: true },
      { attempt: 2, index: 0, text: 'Second try', done: true },
    ]);
  });

  it('publishes long text at once in pieces no larger than a notice allows', async () => {
    const { stream, chunks } = open();
    const text = 'é'.repeat(STREAM_TEXT_MAX_BYTES);
    stream.text(text, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(chunks).toHaveLength(2);
    await stream.close();
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk.text)).toBeLessThanOrEqual(STREAM_TEXT_MAX_BYTES);
    }
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1);
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it('marks a call that produced no text done with one empty chunk', async () => {
    const { stream, chunks } = open();
    await stream.close();
    expect(chunks).toEqual([expect.objectContaining({ index: 0, text: '', done: true })]);
  });

  it('gives every call an id of its own', async () => {
    const first = open();
    const second = open();
    await first.stream.close();
    await second.stream.close();
    expect(first.chunks[0]?.call_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.chunks[0]?.call_id).not.toBe(second.chunks[0]?.call_id);
  });
});
