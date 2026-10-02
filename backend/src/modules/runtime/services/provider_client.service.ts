import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiFormat } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { AnthropicMessagesAdapter } from '@/modules/runtime/adapters/anthropic_messages.adapter';
import { OpenAiChatCompletionsAdapter } from '@/modules/runtime/adapters/openai_chat_completions.adapter';
import type { LlmAdapter } from '@/modules/runtime/interfaces/llm_adapter.interface';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import type { ModelRequest, ModelResponse } from '@/modules/runtime/types/model_request';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import type { ProviderModelRecord } from '@/modules/runtime/types/provider_record';
import type { ModelUsage } from '@/modules/runtime/types/usage_record';
import { KeyedSemaphore } from '@/utils/keyed_semaphore';
import { ProviderService } from './provider.service';
import { NotificationService } from '@/modules/integrations/services/notification.service';

/** Who is calling, for the usage record and the logs. */
export interface ModelCallContext {
  owner_id: string;
  provider_id: string;
  model_id: string;
  agent_id: string;
  run_id: string | null;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;
const MILLION = 1_000_000;

/** Exponential backoff with full jitter, or the delay the provider asked for. */
export function retry_delay_ms(attempt: number, retry_after_ms: number | undefined): number {
  if (retry_after_ms !== undefined) return Math.min(retry_after_ms, MAX_DELAY_MS);
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

/** Cost of one call from the prices the owner entered. Missing prices count as zero. */
export function cost_of(usage: ModelUsage, model: ProviderModelRecord): number {
  const uncached_input = Math.max(
    0,
    usage.input_tokens - usage.cache_read_tokens - usage.cache_write_tokens,
  );
  return (
    (uncached_input * (model.input_price_per_million ?? 0) +
      usage.cache_read_tokens * (model.cache_read_price_per_million ?? 0) +
      usage.cache_write_tokens * (model.cache_write_price_per_million ?? 0) +
      usage.output_tokens * (model.output_price_per_million ?? 0)) /
    MILLION
  );
}

/**
 * Calls a model through the adapter for its API format, with a timeout, retries with backoff and
 * jitter on retryable errors, and a usage record for every successful call. It also keeps the
 * provider's state: a call that fails after its retries counts towards the circuit breaker, a
 * success closes it, and an out-of-credit answer marks the key. A provider's optional parallel
 * request limit is held per attempt.
 *
 * Ceiling: the parallel request slots live in this process.
 */
@Injectable()
export class ProviderClientService {
  private readonly logger = new Logger(ProviderClientService.name);
  private readonly adapters: ReadonlyMap<ApiFormat, LlmAdapter>;
  private readonly slots = new KeyedSemaphore();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    private readonly providers: ProviderService,
    anthropic: AnthropicMessagesAdapter,
    openai: OpenAiChatCompletionsAdapter,
    private readonly notifications: NotificationService,
  ) {
    this.adapters = new Map<ApiFormat, LlmAdapter>([
      [anthropic.api_format, anthropic],
      [openai.api_format, openai],
    ]);
  }

  /**
   * Completes `request` on the model named in `context`.
   *
   * @throws ProviderError after the last attempt, or at once for an error that is not retryable.
   */
  async complete(context: ModelCallContext, request: ModelRequest): Promise<ModelResponse> {
    const connection = await this.providers.open_connection(
      context.owner_id,
      context.provider_id,
      context.model_id,
    );
    const adapter = this.adapters.get(connection.api_format);
    if (adapter === undefined) throw new ProviderError('bad_request', 'Unknown API format');

    const max_attempts = this.config.providers.max_attempts;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.slots.run(
          connection.provider_id,
          connection.max_parallel_requests,
          () =>
            adapter.complete(connection, request, { timeout_ms: this.config.providers.timeout_ms }),
        );
        await this.usage.create({
          owner_id: context.owner_id,
          provider_id: context.provider_id,
          model_id: context.model_id,
          agent_id: context.agent_id,
          run_id: context.run_id,
          ...response.usage,
          cost: cost_of(response.usage, connection.model),
        });
        if (connection.state.breaker_failures > 0 || connection.state.breaker_open_until !== null) {
          await this.providers.record_success(context.owner_id, context.provider_id);
        }
        return response;
      } catch (error: unknown) {
        if (error instanceof ProviderError && error.kind === 'out_of_credit') {
          if (connection.state.out_of_credit_since === null) {
            await this.providers.mark_out_of_credit(context.owner_id, context.provider_id);
            const provider = await this.providers.require(context.owner_id, context.provider_id);
            await this.notifications.emit(context.owner_id, {
              event_type: 'provider_out_of_credit',
              title: `${provider.name} is out of credit`,
              message: `The key of ${provider.name} was refused for credit. Every task on it is blocked until you top it up or change it and resume the provider.`,
              priority: 'high',
              values: { provider_name: provider.name },
            });
          }
          this.logger.warn(`Provider ${context.provider_id} is out of credit: ${error.message}`);
          throw error;
        }
        if (!(error instanceof ProviderError) || !error.retryable || attempt + 1 >= max_attempts) {
          if (error instanceof ProviderError && error.retryable) {
            await this.providers.record_failure(context.owner_id, context.provider_id);
          }
          throw error;
        }
        const delay = retry_delay_ms(attempt, error.retry_after_ms);
        this.logger.warn(
          `Provider call failed (${error.kind}), attempt ${attempt + 1} of ${max_attempts}, retrying in ${delay} ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
