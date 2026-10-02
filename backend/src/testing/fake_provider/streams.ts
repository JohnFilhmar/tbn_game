import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { ApiFormat } from '@tbn/contracts';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import { CACHED_TOKENS, INPUT_TOKENS, OUTPUT_TOKENS } from './bodies';

/** Text split into pieces of two words, the way a model streams it. */
function pieces(text: string): string[] {
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const result: string[] = [];
  for (let index = 0; index < words.length; index += 2) {
    result.push(words.slice(index, index + 2).join(''));
  }
  return result;
}

function halves(text: string): string[] {
  const middle = Math.floor(text.length / 2);
  return [text.slice(0, middle), text.slice(middle)];
}

function pause(ms: number | undefined): Promise<void> {
  return ms === undefined || ms <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk_delay(reply: ScriptedReply): number | undefined {
  return reply.type === 'text' || reply.type === 'tool_use' ? reply.chunk_delay_ms : undefined;
}

async function stream_anthropic(
  response: ServerResponse,
  reply: ScriptedReply,
  cached: boolean,
): Promise<void> {
  const send = (event: string, data: Record<string, unknown>): void => {
    response.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
  };
  send('message_start', {
    message: {
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      stop_reason: null,
      usage: {
        input_tokens: INPUT_TOKENS,
        output_tokens: 1,
        cache_read_input_tokens: cached ? CACHED_TOKENS : 0,
        cache_creation_input_tokens: cached ? 0 : CACHED_TOKENS,
      },
    },
  });
  send('ping', {});
  let index = 0;
  const text = reply.type === 'tool_use' || reply.type === 'stream_error' ? reply.text : undefined;
  const body = reply.type === 'text' ? reply.text : text;
  if (body !== undefined) {
    send('content_block_start', { index, content_block: { type: 'text', text: '' } });
    for (const piece of pieces(body)) {
      await pause(chunk_delay(reply));
      send('content_block_delta', { index, delta: { type: 'text_delta', text: piece } });
    }
    if (reply.type === 'stream_error') {
      send('error', { error: { type: 'overloaded_error', message: 'Overloaded' } });
      response.end();
      return;
    }
    send('content_block_stop', { index });
    index += 1;
  }
  if (reply.type === 'tool_use') {
    send('content_block_start', {
      index,
      content_block: { type: 'tool_use', id: `toolu_${randomUUID()}`, name: reply.name, input: {} },
    });
    for (const part of halves(JSON.stringify(reply.input))) {
      await pause(chunk_delay(reply));
      send('content_block_delta', {
        index,
        delta: { type: 'input_json_delta', partial_json: part },
      });
    }
    send('content_block_stop', { index });
  }
  const stop_reason =
    reply.type === 'tool_use'
      ? 'tool_use'
      : reply.type === 'text'
        ? (reply.stop_reason ?? 'end_turn')
        : 'end_turn';
  send('message_delta', {
    delta: { stop_reason, stop_sequence: null },
    usage: { output_tokens: OUTPUT_TOKENS },
  });
  send('message_stop', {});
  response.end();
}

async function stream_openai(
  response: ServerResponse,
  reply: ScriptedReply,
  cached: boolean,
): Promise<void> {
  const id = `chatcmpl_${randomUUID()}`;
  const send = (
    choice: Record<string, unknown> | null,
    extra: Record<string, unknown> = {},
  ): void => {
    const chunk = {
      id,
      object: 'chat.completion.chunk',
      choices: choice === null ? [] : [{ index: 0, finish_reason: null, ...choice }],
      ...extra,
    };
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };
  send({ delta: { role: 'assistant', content: '' } });
  const text =
    reply.type === 'text'
      ? reply.text
      : reply.type === 'tool_use' || reply.type === 'stream_error'
        ? reply.text
        : undefined;
  for (const piece of pieces(text ?? '')) {
    await pause(chunk_delay(reply));
    send({ delta: { content: piece } });
  }
  if (reply.type === 'stream_error') {
    // Let the pieces reach the client before the connection is cut.
    await pause(50);
    response.destroy();
    return;
  }
  if (reply.type === 'tool_use') {
    const call_id = `call_${randomUUID()}`;
    send({
      delta: {
        tool_calls: [
          {
            index: 0,
            id: call_id,
            type: 'function',
            function: { name: reply.name, arguments: '' },
          },
        ],
      },
    });
    for (const part of halves(JSON.stringify(reply.input))) {
      await pause(chunk_delay(reply));
      send({ delta: { tool_calls: [{ index: 0, function: { arguments: part } }] } });
    }
  }
  const finish_reason =
    reply.type === 'tool_use'
      ? 'tool_calls'
      : reply.type === 'text' && reply.stop_reason === 'max_tokens'
        ? 'length'
        : 'stop';
  send({ delta: {}, finish_reason });
  if (reply.type !== 'text' || reply.stream_usage !== false) {
    send(null, {
      usage: {
        prompt_tokens: INPUT_TOKENS,
        completion_tokens: OUTPUT_TOKENS,
        prompt_tokens_details: { cached_tokens: cached ? CACHED_TOKENS : 0 },
      },
    });
  }
  response.write('data: [DONE]\n\n');
  response.end();
}

/**
 * Answers a streamed request with server-sent events in the server's API format: text in pieces
 * of two words, tool arguments in two halves, usage at the end. A `stream_error` reply sends some
 * text and then fails: Anthropic with an `error` event, OpenAI by cutting the connection.
 */
export function stream_reply(
  response: ServerResponse,
  api_format: ApiFormat,
  reply: ScriptedReply,
  cached: boolean,
): Promise<void> {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  return api_format === 'anthropic_messages'
    ? stream_anthropic(response, reply, cached)
    : stream_openai(response, reply, cached);
}
