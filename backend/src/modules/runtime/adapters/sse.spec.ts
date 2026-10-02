import { read_sse, type SseMessage } from './sse';

function body_of(pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

async function all(pieces: string[]): Promise<SseMessage[]> {
  const messages: SseMessage[] = [];
  for await (const message of read_sse(body_of(pieces))) messages.push(message);
  return messages;
}

describe('read_sse', () => {
  it('reads events with names and data, across any chunking and line ending', async () => {
    const text =
      'event: one\ndata: {"a":1}\n\n: a comment\ndata: two\r\ndata: lines\r\n\r\nevent: three\rdata:x\r\r';
    const expected = [
      { event: 'one', data: '{"a":1}' },
      { event: null, data: 'two\nlines' },
      { event: 'three', data: 'x' },
    ];
    expect(await all([text])).toEqual(expected);
    expect(await all(text.split(''))).toEqual(expected);
    expect(await all([text.slice(0, 40), text.slice(40, 41), text.slice(41)])).toEqual(expected);
  });

  it('keeps multibyte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('data: héllo 🦩\n\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const messages: SseMessage[] = [];
    for await (const message of read_sse(body)) messages.push(message);
    expect(messages).toEqual([{ event: null, data: 'héllo 🦩' }]);
  });

  it('drops a last event that never got its blank line, and skips unknown fields', async () => {
    expect(await all(['id: 7\nretry: 10\ndata: kept\n\ndata: cut'])).toEqual([
      { event: null, data: 'kept' },
    ]);
  });
});
