import { Injectable } from '@nestjs/common';
import { ToolUseBlockSchema } from '@tbn/contracts';
import { z } from 'zod';
import type {
  AdapterCallOptions,
  LlmAdapter,
} from '@/modules/runtime/interfaces/llm_adapter.interface';
import type {
  AssistantBlock,
  ModelMessage,
  ModelRequest,
  ModelResponse,
} from '@/modules/runtime/types/model_request';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import type { ProviderConnection } from '@/modules/runtime/types/provider_record';
import { assemble_anthropic_stream, to_stop_reason } from './anthropic_stream';
import { error_excerpt, retry_after_ms, stream_failure } from './http/failures';
import { post_json, post_stream, type PostJsonOptions } from './http/post';
import { read_sse } from './sse';

const ANTHROPIC_VERSION = '2023-06-01';
const CACHE_CONTROL = { type: 'ephemeral' };

const ResponseSchema = z.looseObject({
  content: z.array(
    z.discriminatedUnion('type', [
      z.looseObject({ type: z.literal('text'), text: z.string() }),
      z.looseObject({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: ToolUseBlockSchema.shape.input,
      }),
    ]),
  ),
  stop_reason: z.string().nullable(),
  usage: z.looseObject({
    input_tokens: z.number().int(),
    output_tokens: z.number().int(),
    cache_read_input_tokens: z.number().int().nullish(),
    cache_creation_input_tokens: z.number().int().nullish(),
  }),
});

const ErrorBodySchema = z.looseObject({
  error: z.looseObject({ type: z.string().optional(), message: z.string().optional() }),
});

function to_wire_messages(messages: ModelMessage[]): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content.map((block) => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text };
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error,
          };
        case 'tool_use':
          return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      }
    }),
  }));
}

function classify(status: number, body: unknown, text: string, headers: Headers): ProviderError {
  const parsed = ErrorBodySchema.safeParse(body);
  const message = parsed.success ? (parsed.data.error.message ?? '') : '';
  const detail = `Anthropic answered ${status}: ${error_excerpt(message || text)}`;
  if (status === 401 || status === 403)
    return new ProviderError('authentication', detail, { status });
  if (status === 402 || /credit balance/i.test(message)) {
    return new ProviderError('out_of_credit', detail, { status });
  }
  if (status === 429) {
    return new ProviderError('rate_limited', detail, {
      status,
      retry_after_ms: retry_after_ms(headers),
    });
  }
  if (status >= 500)
    return new ProviderError('server', detail, { status, retry_after_ms: retry_after_ms(headers) });
  return new ProviderError('bad_request', detail, { status });
}

/**
 * The Anthropic Messages API. The system prompt and the last tool carry `cache_control`, so the
 * stable prefix is cached by the provider. With `on_text` the answer streams as server-sent
 * events and each piece of text is passed on as it arrives.
 */
@Injectable()
export class AnthropicMessagesAdapter implements LlmAdapter {
  readonly api_format = 'anthropic_messages';

  async complete(
    connection: ProviderConnection,
    request: ModelRequest,
    options: AdapterCallOptions,
  ): Promise<ModelResponse> {
    const tools = request.tools.map((tool, index) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
      ...(index === request.tools.length - 1 && { cache_control: CACHE_CONTROL }),
    }));
    const call = {
      url: `${connection.base_url.replace(/\/$/, '')}/v1/messages`,
      headers: { 'x-api-key': connection.api_key, 'anthropic-version': ANTHROPIC_VERSION },
      body: {
        model: connection.model.model_id,
        max_tokens: connection.model.max_output_tokens,
        system: [{ type: 'text', text: request.system, cache_control: CACHE_CONTROL }],
        ...(tools.length > 0 && { tools }),
        messages: to_wire_messages(request.messages),
        ...(options.on_text !== undefined && { stream: true }),
      },
      timeout_ms: options.timeout_ms,
    };
    if (options.on_text !== undefined) return this.stream(call, options.on_text);

    const result = await post_json(call);
    if (result.status !== 200)
      throw classify(result.status, result.body, result.text, result.headers);

    const parsed = ResponseSchema.safeParse(result.body);
    if (!parsed.success) {
      throw new ProviderError('server', 'Anthropic answered with an unexpected body', {
        status: result.status,
      });
    }
    const content: AssistantBlock[] = parsed.data.content.map((block) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool_use', id: block.id, name: block.name, input: block.input },
    );
    return {
      content,
      stop_reason: to_stop_reason(parsed.data.stop_reason),
      usage: {
        input_tokens: parsed.data.usage.input_tokens,
        output_tokens: parsed.data.usage.output_tokens,
        cache_read_tokens: parsed.data.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: parsed.data.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  private async stream(
    call: PostJsonOptions,
    on_text: (text: string) => void,
  ): Promise<ModelResponse> {
    const result = await post_stream(call);
    if (result.body === null) {
      throw classify(result.status, result.error_body, result.error_text, result.headers);
    }
    try {
      return await assemble_anthropic_stream(read_sse(result.body), on_text);
    } catch (error: unknown) {
      throw stream_failure(error, call.timeout_ms);
    }
  }
}
