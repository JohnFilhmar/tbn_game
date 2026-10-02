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

const UsageSchema = z.looseObject({
  input_tokens: z.number().int().nullish(),
  output_tokens: z.number().int().nullish(),
  cache_read_input_tokens: z.number().int().nullish(),
  cache_creation_input_tokens: z.number().int().nullish(),
});

const StreamEventSchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('message_start'),
    message: z.looseObject({ usage: UsageSchema.optional() }),
  }),
  z.looseObject({
    type: z.literal('content_block_start'),
    index: z.number().int(),
    content_block: z.looseObject({
      type: z.string(),
      text: z.string().optional(),
      id: z.string().optional(),
      name: z.string().optional(),
    }),
  }),
  z.looseObject({
    type: z.literal('content_block_delta'),
    index: z.number().int(),
    delta: z.looseObject({
      type: z.string(),
      text: z.string().optional(),
      partial_json: z.string().optional(),
    }),
  }),
  z.looseObject({ type: z.literal('content_block_stop'), index: z.number().int() }),
  z.looseObject({
    type: z.literal('message_delta'),
    delta: z.looseObject({ stop_reason: z.string().nullish() }),
    usage: UsageSchema.optional(),
  }),
  z.looseObject({ type: z.literal('message_stop') }),
  z.looseObject({
    type: z.literal('error'),
    error: z.looseObject({ type: z.string().optional(), message: z.string().optional() }),
  }),
]);

type StreamEvent = z.infer<typeof StreamEventSchema>;

type Block =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; json: string };

/** Maps Anthropic's stop reason to the neutral one. */
export function to_stop_reason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'other';
  }
}

function stream_error(error: { type?: string; message?: string }): ProviderError {
  const detail = `Anthropic stream failed: ${error.message ?? error.type ?? 'unknown error'}`;
  switch (error.type) {
    case 'rate_limit_error':
      return new ProviderError('rate_limited', detail, { status: 429 });
    case 'authentication_error':
    case 'permission_error':
      return new ProviderError('authentication', detail);
    case 'invalid_request_error':
    case 'not_found_error':
    case 'request_too_large':
      return new ProviderError('bad_request', detail);
    default:
      return new ProviderError('server', detail);
  }
}

function tool_input(json: string): ToolUseBlock['input'] {
  try {
    const parsed: unknown = JSON.parse(json.length > 0 ? json : '{}');
    const input = ToolUseBlockSchema.shape.input.safeParse(parsed);
    return input.success ? input.data : {};
  } catch {
    return {};
  }
}

function parse_event(message: SseMessage): StreamEvent | null {
  try {
    const parsed = StreamEventSchema.safeParse(JSON.parse(message.data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Builds the answer of an Anthropic Messages stream from its server-sent events, calling `on_text`
 * with each piece of text as it arrives. Tool calls gather their JSON input across deltas. Input
 * and cache tokens come from `message_start`, output tokens from the last `message_delta`. Event
 * types it does not know, such as `ping`, are skipped.
 *
 * @throws ProviderError for an `error` event, or when the stream ends before `message_stop`.
 */
export async function assemble_anthropic_stream(
  messages: AsyncIterable<SseMessage>,
  on_text: (text: string) => void,
): Promise<ModelResponse> {
  const blocks = new Map<number, Block>();
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  let stop_reason: string | null = null;
  let stopped = false;
  for await (const message of messages) {
    const event = parse_event(message);
    if (event === null) continue;
    switch (event.type) {
      case 'message_start': {
        const start = event.message.usage;
        usage.input_tokens = start?.input_tokens ?? 0;
        usage.output_tokens = start?.output_tokens ?? 0;
        usage.cache_read_tokens = start?.cache_read_input_tokens ?? 0;
        usage.cache_write_tokens = start?.cache_creation_input_tokens ?? 0;
        break;
      }
      case 'content_block_start': {
        const block = event.content_block;
        if (block.type === 'text') {
          blocks.set(event.index, { type: 'text', text: block.text ?? '' });
          if ((block.text ?? '').length > 0) on_text(block.text ?? '');
        } else if (block.type === 'tool_use') {
          blocks.set(event.index, {
            type: 'tool_use',
            id: block.id ?? '',
            name: block.name ?? '',
            json: '',
          });
        }
        break;
      }
      case 'content_block_delta': {
        const block = blocks.get(event.index);
        if (block?.type === 'text' && event.delta.type === 'text_delta') {
          block.text += event.delta.text ?? '';
          if ((event.delta.text ?? '').length > 0) on_text(event.delta.text ?? '');
        } else if (block?.type === 'tool_use' && event.delta.type === 'input_json_delta') {
          block.json += event.delta.partial_json ?? '';
        }
        break;
      }
      case 'message_delta':
        stop_reason = event.delta.stop_reason ?? stop_reason;
        usage.output_tokens = event.usage?.output_tokens ?? usage.output_tokens;
        usage.input_tokens = event.usage?.input_tokens ?? usage.input_tokens;
        usage.cache_read_tokens = event.usage?.cache_read_input_tokens ?? usage.cache_read_tokens;
        usage.cache_write_tokens =
          event.usage?.cache_creation_input_tokens ?? usage.cache_write_tokens;
        break;
      case 'message_stop':
        stopped = true;
        break;
      case 'error':
        throw stream_error(event.error);
      case 'content_block_stop':
        break;
    }
  }
  if (!stopped) {
    throw new ProviderError('network', 'The stream ended before the message was complete');
  }
  const content: AssistantBlock[] = [...blocks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, block]) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool_use', id: block.id, name: block.name, input: tool_input(block.json) },
    );
  return { content, stop_reason: to_stop_reason(stop_reason), usage };
}
