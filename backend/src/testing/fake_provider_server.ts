import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiFormat } from '@tbn/contracts';
import { z } from 'zod';
import { anthropic_body, openai_body } from './fake_provider/bodies';
import { stream_reply } from './fake_provider/streams';

/**
 * What the fake model answers next, in the neutral shape. A streamed request gets the same answer
 * as server-sent events, `chunk_delay_ms` apart; `stream_usage: false` leaves the usage out of an
 * OpenAI stream, and `stream_error` sends `text` and then fails the stream.
 */
export type ScriptedReply =
  | {
      type: 'text';
      text: string;
      stop_reason?: 'end_turn' | 'max_tokens';
      delay_ms?: number;
      chunk_delay_ms?: number;
      stream_usage?: false;
    }
  | {
      type: 'tool_use';
      name: string;
      input: Record<string, unknown>;
      text?: string;
      delay_ms?: number;
      chunk_delay_ms?: number;
    }
  | { type: 'stream_error'; text: string }
  | { type: 'status'; status: number; body?: unknown; headers?: Record<string, string> }
  | { type: 'hold' };

const StreamFlagSchema = z.looseObject({ stream: z.literal(true) });

/** One request the fake server received. */
export interface RecordedRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  received_at: number;
}

/** Picks the reply to one request from what it carries. Undefined falls back to an empty reply. */
export type Responder = (request: RecordedRequest) => ScriptedReply | undefined;

/** A running fake provider. */
export interface FakeProviderServer {
  base_url: string;
  api_format: ApiFormat;
  requests: RecordedRequest[];
  /** The most requests it has had in flight at once. */
  readonly max_in_flight: number;
  /**
   * Queues the next reply. Without a script, the responder picks the reply, and without a
   * responder the server answers an empty `end_turn`.
   */
  enqueue(reply: ScriptedReply): void;
  /** Answers every request the script does not cover, so several agents can share one server. */
  respond(responder: Responder): void;
  /** Lets held requests through. */
  release(): void;
  close(): Promise<void>;
}

function read_body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('error', reject);
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) {
        resolve(null);
        return;
      }
      const parsed: unknown = JSON.parse(text);
      resolve(parsed);
    });
  });
}

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body ?? {}));
}

/**
 * Starts a fake provider on a random port that speaks one API format. Tests script its replies,
 * so the real adapters, retries and usage accounting run against it.
 */
export async function start_fake_provider_server(
  api_format: ApiFormat,
): Promise<FakeProviderServer> {
  const script: ScriptedReply[] = [];
  const requests: RecordedRequest[] = [];
  const holds: Array<() => void> = [];
  let release_held = false;
  let responder: Responder | undefined;
  let in_flight = 0;
  let max_in_flight = 0;

  const server: Server = createServer((request, response) => {
    in_flight += 1;
    max_in_flight = Math.max(max_in_flight, in_flight);
    response.on('close', () => {
      in_flight -= 1;
    });
    void (async () => {
      const body = await read_body(request);
      const recorded: RecordedRequest = {
        path: request.url ?? '',
        headers: request.headers,
        body,
        received_at: Date.now(),
      };
      requests.push(recorded);
      const reply = script.shift() ?? responder?.(recorded) ?? { type: 'text', text: '' };
      const streamed = StreamFlagSchema.safeParse(body).success;
      if (reply.type === 'hold') {
        if (!release_held) await new Promise<void>((resolve) => holds.push(resolve));
        if (streamed) {
          await stream_reply(response, api_format, { type: 'text', text: 'held reply' }, true);
          return;
        }
        send(
          response,
          200,
          api_format === 'anthropic_messages'
            ? anthropic_body({ type: 'text', text: 'held reply' }, true)
            : openai_body({ type: 'text', text: 'held reply' }, true),
        );
        return;
      }
      if (reply.type === 'status') {
        send(
          response,
          reply.status,
          reply.body ?? { error: { message: `fake ${reply.status}` } },
          reply.headers,
        );
        return;
      }
      if (reply.type !== 'stream_error' && reply.delay_ms !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, reply.delay_ms));
      }
      const cached = requests.length > 1;
      if (streamed) {
        await stream_reply(response, api_format, reply, cached);
        return;
      }
      if (reply.type === 'stream_error') {
        send(response, 500, { error: { message: 'fake stream error' } });
        return;
      }
      send(
        response,
        200,
        api_format === 'anthropic_messages'
          ? anthropic_body(reply, cached)
          : openai_body(reply, cached),
      );
    })().catch((error: unknown) => {
      send(response, 500, {
        error: { message: error instanceof Error ? error.message : 'fake failure' },
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port =
    typeof address === 'object' && address !== null ? (address satisfies AddressInfo).port : 0;

  return {
    base_url: `http://127.0.0.1:${port}${api_format === 'openai_chat_completions' ? '/v1' : ''}`,
    api_format,
    requests,
    get max_in_flight() {
      return max_in_flight;
    },
    enqueue: (reply) => {
      script.push(reply);
    },
    respond: (next) => {
      responder = next;
    },
    release: () => {
      release_held = true;
      for (const resolve of holds.splice(0)) resolve();
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
