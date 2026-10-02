import type { ApiFormat } from '@tbn/contracts';
import type { ModelRequest, ModelResponse } from '@/modules/runtime/types/model_request';
import type { ProviderConnection } from '@/modules/runtime/types/provider_record';

/** Options for one adapter call. */
export interface AdapterCallOptions {
  /** Abort the HTTP request after this long. */
  timeout_ms: number;
}

/**
 * One API format behind the provider interface. An adapter maps the neutral request to the
 * provider's wire format and back, and classifies failures as `ProviderError`. It never retries.
 */
export interface LlmAdapter {
  readonly api_format: ApiFormat;
  complete(
    connection: ProviderConnection,
    request: ModelRequest,
    options: AdapterCallOptions,
  ): Promise<ModelResponse>;
}
