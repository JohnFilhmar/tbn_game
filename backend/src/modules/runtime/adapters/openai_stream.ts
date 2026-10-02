import { randomUUID } from 'node:crypto';
import { ToolUseBlockSchema } from '@tbn/contracts';
import { z } from 'zod';
import type {
  AssistantBlock,
  ModelResponse,
  StopReason,
  ToolUseBlock,
} from '@/modules/runtime/types/model_request';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import type { SseMessage } from './sse';

/** The end of an OpenAI stream. */
const DONE = '[DONE]';

const UsageSchema = z.looseObject({
  prompt_tokens: z.number().int(),
  completion_tokens: z.number().int(),
  prompt_tokens_details: z.looseObject({ cached_tokens: z.number().int().nullish() }).nullish(),
});

const ChunkSchema = z.looseObject({
  choices: z
    .array(
      z.looseObject({
        delta: z
          .looseObject({
            content: z.string().nullish(),
            tool_calls: z
              .array(
                z.looseObject({
                  index: z.number().int(),
                  id: z.string().nullish(),
                  function: z
                    .looseObject({ name: z.string().nullish(), arguments: z.string().nullish() })
                    .nullish(),
                }),
              )
              .nullish(),
          })
          .nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .nullish(),
  usage: UsageSchema.nullish(),
  error: z.looseObject({ message: z.string().nullish() }).nullish(),
});

/** The token counts an OpenAI-compatible server reports, in the neutral shape. */
function to_usage(usage: z.infer<typeof UsageSchema> | null | undefined): {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
} {
  return {
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
    cache_read_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cache_write_tokens: 0,
  };
}

/** Parses a tool call's JSON arguments; anything that is not an object becomes `{}`. */
export function parse_arguments(raw: string): ToolUseBlock['input'] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const input = ToolUseBlockSchema.shape.input.safeParse(parsed);
    return input.success ? input.data : {};
  } catch {
    return {};
  }
}

/** Maps an OpenAI finish reason to the neutral stop reason; any tool call means `tool_use`. */
export function to_stop_reason(
  reason: string | null | undefined,
  has_tool_calls: boolean,
): StopReason {
  if (has_tool_calls) return 'tool_use';
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'other';
  }
}

interface PartialCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Builds the answer of an OpenAI chat completions stream from its chunks, calling `on_text` with
 * each piece of text as it arrives. Tool calls gather their arguments by index. Usage comes from
 * the chunk `stream_options.include_usage` asks for; a server that sends none records zero tokens,
 * as a missing `usage` does without streaming.
 *
 * @throws ProviderError for an error chunk, or when the stream ends before a finish reason.
 */
export async function assemble_openai_stream(
  messages: AsyncIterable<SseMessage>,
  on_text: (text: string) => void,
): Promise<ModelResponse> {
  let text = '';
  const calls = new Map<number, PartialCall>();
  let finish: string | null = null;
  let usage: z.infer<typeof UsageSchema> | null = null;
  let done = false;
  for await (const message of messages) {
    if (message.data === DONE) {
      done = true;
      break;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(message.data);
    } catch {
      continue;
    }
    const parsed = ChunkSchema.safeParse(raw);
    if (!parsed.success) continue;
    const chunk = parsed.data;
    if (chunk.error !== null && chunk.error !== undefined) {
      throw new ProviderError(
        'server',
        `Provider stream failed: ${chunk.error.message ?? 'unknown error'}`,
      );
    }
    const choice = chunk.choices?.[0];
    const piece = choice?.delta?.content ?? '';
    if (piece.length > 0) {
      text += piece;
      on_text(piece);
    }
    for (const call of choice?.delta?.tool_calls ?? []) {
      const partial = calls.get(call.index) ?? { id: '', name: '', arguments: '' };
      if (partial.id.length === 0) partial.id = call.id ?? '';
      if (partial.name.length === 0) partial.name = call.function?.name ?? '';
      partial.arguments += call.function?.arguments ?? '';
      calls.set(call.index, partial);
    }
    finish = choice?.finish_reason ?? finish;
    usage = chunk.usage ?? usage;
  }
  if (!done && finish === null) {
    throw new ProviderError('network', 'The stream ended before the answer was complete');
  }
  const content: AssistantBlock[] = [];
  if (text.length > 0) content.push({ type: 'text', text });
  for (const [, call] of [...calls.entries()].sort(([left], [right]) => left - right)) {
    content.push({
      type: 'tool_use',
      id: call.id.length > 0 ? call.id : randomUUID(),
      name: call.name,
      input: parse_arguments(call.arguments.length > 0 ? call.arguments : '{}'),
    });
  }
  return { content, stop_reason: to_stop_reason(finish, calls.size > 0), usage: to_usage(usage) };
}
