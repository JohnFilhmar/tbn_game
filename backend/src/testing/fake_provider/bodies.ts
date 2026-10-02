import { randomUUID } from 'node:crypto';
import type { ScriptedReply } from '@/testing/fake_provider_server';

/** The token counts every fake answer reports. */
export const INPUT_TOKENS = 120;
export const OUTPUT_TOKENS = 30;
export const CACHED_TOKENS = 100;

/** A non-streamed Anthropic Messages answer. */
export function anthropic_body(reply: ScriptedReply, cached: boolean): unknown {
  const content: unknown[] = [];
  let stop_reason = 'end_turn';
  if (reply.type === 'text') {
    content.push({ type: 'text', text: reply.text });
    stop_reason = reply.stop_reason ?? 'end_turn';
  } else if (reply.type === 'tool_use') {
    if (reply.text !== undefined) content.push({ type: 'text', text: reply.text });
    content.push({
      type: 'tool_use',
      id: `toolu_${randomUUID()}`,
      name: reply.name,
      input: reply.input,
    });
    stop_reason = 'tool_use';
  }
  return {
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    content,
    stop_reason,
    usage: {
      input_tokens: INPUT_TOKENS,
      output_tokens: OUTPUT_TOKENS,
      cache_read_input_tokens: cached ? CACHED_TOKENS : 0,
      cache_creation_input_tokens: cached ? 0 : CACHED_TOKENS,
    },
  };
}

/** A non-streamed OpenAI chat completions answer. */
export function openai_body(reply: ScriptedReply, cached: boolean): unknown {
  let content: string | null = null;
  const tool_calls: unknown[] = [];
  let finish_reason = 'stop';
  if (reply.type === 'text') {
    content = reply.text;
    finish_reason = reply.stop_reason === 'max_tokens' ? 'length' : 'stop';
  } else if (reply.type === 'tool_use') {
    content = reply.text ?? null;
    tool_calls.push({
      id: `call_${randomUUID()}`,
      type: 'function',
      function: { name: reply.name, arguments: JSON.stringify(reply.input) },
    });
    finish_reason = 'tool_calls';
  }
  return {
    id: `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, ...(tool_calls.length > 0 && { tool_calls }) },
        finish_reason,
      },
    ],
    usage: {
      prompt_tokens: INPUT_TOKENS,
      completion_tokens: OUTPUT_TOKENS,
      prompt_tokens_details: { cached_tokens: cached ? CACHED_TOKENS : 0 },
    },
  };
}
