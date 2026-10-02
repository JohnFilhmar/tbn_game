/** One server-sent event: its `event` field, if any, and its data lines joined by newlines. */
export interface SseMessage {
  event: string | null;
  data: string;
}

const LINE_END = /\r\n|\r|\n/;

/**
 * Reads server-sent events from a response body as they arrive. It follows the format's rules:
 * any of the three line endings, `data` lines joined, comments and unknown fields skipped, and an
 * event dispatched at each blank line. A last event without its blank line is dropped, as the
 * format says.
 */
export async function* read_sse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      for (;;) {
        const match = LINE_END.exec(buffer);
        if (match === null) break;
        // A carriage return at the very end may be the first half of a CRLF still in flight.
        if (match[0] === '\r' && match.index === buffer.length - 1 && !done) break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (line.length === 0) {
          if (data.length > 0) yield { event, data: data.join('\n') };
          event = null;
          data = [];
          continue;
        }
        if (line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        const raw = colon < 0 ? '' : line.slice(colon + 1);
        const value_text = raw.startsWith(' ') ? raw.slice(1) : raw;
        if (field === 'event') event = value_text;
        else if (field === 'data') data.push(value_text);
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
