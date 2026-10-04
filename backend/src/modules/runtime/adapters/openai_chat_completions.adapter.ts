import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
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
import { error_excerpt, retry_after_ms, stream_failure } from './http/failures';
import { post_json, post_stream, type PostJsonOptions } from './http/post';
import { assemble_openai_stream, parse_arguments, to_stop_reason } from './openai_stream';
import { read_sse } from './sse';

const ResponseSchema = z.looseObject({
  choices: z
    .array(
      z.looseObject({
        message: z.looseObject({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.looseObject({
                id: z.string(),
                function: z.looseObject({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullish(),
        }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z
    .looseObject({
      prompt_tokens: z.number().int(),
      completion_tokens: z.number().int(),
      prompt_tokens_details: z.looseObject({ cached_tokens: z.number().int().nullish() }).nullish(),
    })
    .nullish(),
});

const ErrorBodySchema = z.looseObject({
  error: z.looseObject({
    code: z.string().nullish(),
    type: z.string().nullish(),
    message: z.string().nullish(),
  }),
});

function to_wire_messages(system: string, messages: ModelMessage[]): unknown[] {
  const wire: unknown[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const tool_calls = message.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        }));
      wire.push({
        role: 'assistant',
        content: text.length > 0 ? text : null,
        ...(tool_calls.length > 0 && { tool_calls }),
      });
      continue;
    }
    for (const block of message.content) {
      if (block.type === 'text') {
        wire.push({ role: 'user', content: block.text });
      } else {
        wire.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
      }
    }
  }
  return wire;
}

function classify(status: number, body: unknown, text: string, headers: Headers): ProviderError {
  const parsed = ErrorBodySchema.safeParse(body);
  const code = parsed.success ? (parsed.data.error.code ?? parsed.data.error.type ?? '') : '';
  const message = parsed.success ? (parsed.data.error.message ?? '') : '';
  const detail = `Provider answered ${status}: ${error_excerpt(message || text)}`;
  if (status === 401 || status === 403)
    return new ProviderError('authentication', detail, { status });
  if (status === 402 || code === 'insufficient_quota' || /insufficient.quota/i.test(message)) {
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
 * OpenAI-compatible chat completions, which also serves local servers such as Ollama. The system
 * message comes first so the provider's automatic prefix caching applies; cached tokens are read
 * from `prompt_tokens_details`. With `on_text` the answer streams, asking for usage in the stream.
 */
@Injectable()
export class OpenAiChatCompletionsAdapter implements LlmAdapter {
  readonly api_format = 'openai_chat_completions';

  async complete(
    connection: ProviderConnection,
    request: ModelRequest,
    options: AdapterCallOptions,
  ): Promise<ModelResponse> {
    const tools = request.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    }));
    const call = {
      url: `${connection.base_url.replace(/\/$/, '')}/chat/completions`,
      headers: {
        ...(connection.api_key !== null && { authorization: `Bearer ${connection.api_key}` }),
      },
      body: {
        model: connection.model.model_id,
        max_tokens: connection.model.max_output_tokens,
        messages: to_wire_messages(request.system, request.messages),
        ...(tools.length > 0 && { tools }),
        ...(options.on_text !== undefined && {
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
      timeout_ms: options.timeout_ms,
    };
    if (options.on_text !== undefined) return this.stream(call, options.on_text);

    const result = await post_json(call);
    if (result.status !== 200)
      throw classify(result.status, result.body, result.text, result.headers);

    const parsed = ResponseSchema.safeParse(result.body);
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (!parsed.success || choice === undefined) {
      throw new ProviderError('server', 'Provider answered with an unexpected body', {
        status: result.status,
      });
    }
    const content: AssistantBlock[] = [];
    const text = choice.message.content ?? '';
    if (text.length > 0) content.push({ type: 'text', text });
    for (const call of choice.message.tool_calls ?? []) {
      content.push({
        type: 'tool_use',
        id: call.id.length > 0 ? call.id : randomUUID(),
        name: call.function.name,
        input: parse_arguments(call.function.arguments),
      });
    }
    const usage = parsed.data.usage;
    return {
      content,
      stop_reason: to_stop_reason(
        choice.finish_reason,
        (choice.message.tool_calls ?? []).length > 0,
      ),
      usage: {
        input_tokens: usage?.prompt_tokens ?? 0,
        output_tokens: usage?.completion_tokens ?? 0,
        cache_read_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cache_write_tokens: 0,
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
      return await assemble_openai_stream(read_sse(result.body), on_text);
    } catch (error: unknown) {
      throw stream_failure(error, call.timeout_ms);
    }
  }
}
