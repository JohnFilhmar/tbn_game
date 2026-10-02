import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

/** The marker a task's instructions carry to play the approval story. */
export const APPROVAL_MARKER = '[e2e:approval]';

const BlockSchema = z.looseObject({ type: z.string(), text: z.string().optional() });
const RequestSchema = z.looseObject({
  stream: z.boolean().optional(),
  messages: z
    .array(
      z.looseObject({
        role: z.string(),
        content: z.union([z.string(), z.array(BlockSchema)]),
      }),
    )
    .default([]),
});

type Reply =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; text: string; name: string; input: Record<string, string> };

/** What the conversation so far asks of the model: its texts and how many tool results it has. */
function readConversation(body: z.infer<typeof RequestSchema>): {
  texts: string[];
  results: number;
} {
  const texts: string[] = [];
  let results = 0;
  for (const message of body.messages) {
    if (message.role !== 'user') continue;
    const blocks =
      typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : message.content;
    for (const block of blocks) {
      if (block.type === 'tool_result') results += 1;
      if (block.type === 'text' && block.text !== undefined) texts.push(block.text);
    }
  }
  return { texts, results };
}

/**
 * The approval story: list the roster, which the agent's policy makes wait for the owner, then
 * finish the task. Anything else gets a short streamed answer that quotes the owner.
 */
function plan(body: z.infer<typeof RequestSchema>): Reply {
  const { texts, results } = readConversation(body);
  if (texts.some((text) => text.includes(APPROVAL_MARKER))) {
    if (results === 0) {
      return {
        kind: 'tool',
        text: 'I will check who is on the team first.',
        name: 'list_roster',
        input: {},
      };
    }
    return {
      kind: 'tool',
      text: 'The team is known, so I am reporting back.',
      name: 'finish_task',
      input: {
        outcome: 'The roster check is done and the team is ready.',
        what_was_done: 'Listed the roster after the owner approved it.',
        decisions: 'Waited for the owner before reading the roster.',
        open_questions: 'None.',
      },
    };
  }
  const last = texts.at(-1) ?? '';
  return { kind: 'text', text: `Hello from the fake model. You wrote: ${last.slice(0, 200)}` };
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function pieces(text: string): string[] {
  const words = text.match(/\S+\s*/g) ?? [];
  const result: string[] = [];
  for (let index = 0; index < words.length; index += 2)
    result.push(words.slice(index, index + 2).join(''));
  return result;
}

const USAGE = {
  input_tokens: 300,
  output_tokens: 1,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

async function stream(response: ServerResponse, reply: Reply, pieceDelayMs: number): Promise<void> {
  const send = (event: string, data: Record<string, unknown>): void => {
    response.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
  };
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  send('message_start', {
    message: {
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      stop_reason: null,
      usage: USAGE,
    },
  });
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (const piece of pieces(reply.text)) {
    await pause(pieceDelayMs);
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: piece } });
  }
  send('content_block_stop', { index: 0 });
  if (reply.kind === 'tool') {
    send('content_block_start', {
      index: 1,
      content_block: { type: 'tool_use', id: `toolu_${randomUUID()}`, name: reply.name, input: {} },
    });
    send('content_block_delta', {
      index: 1,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) },
    });
    send('content_block_stop', { index: 1 });
  }
  send('message_delta', {
    delta: { stop_reason: reply.kind === 'tool' ? 'tool_use' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: 40 },
  });
  send('message_stop', {});
  response.end();
}

function answer(response: ServerResponse, reply: Reply): void {
  const content: unknown[] = [{ type: 'text', text: reply.text }];
  if (reply.kind === 'tool') {
    content.push({
      type: 'tool_use',
      id: `toolu_${randomUUID()}`,
      name: reply.name,
      input: reply.input,
    });
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content,
      stop_reason: reply.kind === 'tool' ? 'tool_use' : 'end_turn',
      usage: { ...USAGE, output_tokens: 40 },
    }),
  );
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length === 0) return {};
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

/** A fake model speaking the Anthropic Messages format, streamed a few words at a time. */
export interface FakeModel {
  baseUrl: string;
  close: () => Promise<void>;
}

/** Starts the fake model on a free local port. */
export async function startFakeModel(pieceDelayMs = 60): Promise<FakeModel> {
  const server: Server = createServer((request, response) => {
    readBody(request)
      .then(async (raw) => {
        const body = RequestSchema.parse(raw);
        const reply = plan(body);
        if (body.stream === true) await stream(response, reply, pieceDelayMs);
        else answer(response, reply);
      })
      .catch((error: unknown) => {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: String(error) } }));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port =
    address !== null && typeof address === 'object' ? (address satisfies AddressInfo).port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
