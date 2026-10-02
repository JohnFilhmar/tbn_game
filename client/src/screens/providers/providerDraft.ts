import type { ApiFormat, CostTier, Provider, ProviderModel } from '@tbn/contracts';
import { numberOrNull, numberText, optionalNumber } from '@/lib/forms/numbers';

/** One model of the provider form, as typed. */
export interface ModelDraft {
  model_id: string;
  cost_tier: CostTier;
  input_price_per_million: string;
  output_price_per_million: string;
  cache_read_price_per_million: string;
  cache_write_price_per_million: string;
  max_output_tokens: string;
  context_window_tokens: string;
}

/** The provider form, as typed. The key stays empty unless the owner sets a new one. */
export interface ProviderDraft {
  name: string;
  api_format: ApiFormat;
  base_url: string;
  api_key: string;
  is_local: boolean;
  max_parallel_requests: string;
  models: ModelDraft[];
}

/** A new model row. */
export const EMPTY_MODEL: ModelDraft = {
  model_id: '',
  cost_tier: 'standard',
  input_price_per_million: '',
  output_price_per_million: '',
  cache_read_price_per_million: '',
  cache_write_price_per_million: '',
  max_output_tokens: '',
  context_window_tokens: '',
};

/** An empty provider form with one model row. */
export const EMPTY_PROVIDER_DRAFT: ProviderDraft = {
  name: '',
  api_format: 'anthropic_messages',
  base_url: '',
  api_key: '',
  is_local: false,
  max_parallel_requests: '',
  models: [EMPTY_MODEL],
};

function modelDraftOf(model: ProviderModel): ModelDraft {
  return {
    model_id: model.model_id,
    cost_tier: model.cost_tier,
    input_price_per_million: numberText(model.input_price_per_million),
    output_price_per_million: numberText(model.output_price_per_million),
    cache_read_price_per_million: numberText(model.cache_read_price_per_million),
    cache_write_price_per_million: numberText(model.cache_write_price_per_million),
    max_output_tokens: numberText(model.max_output_tokens),
    context_window_tokens: numberText(model.context_window_tokens),
  };
}

/** The form of an existing provider. Its key is never sent back, so the field starts empty. */
export function providerDraftOf(provider: Provider): ProviderDraft {
  return {
    name: provider.name,
    api_format: provider.api_format,
    base_url: provider.base_url,
    api_key: '',
    is_local: provider.is_local,
    max_parallel_requests: numberText(provider.max_parallel_requests),
    models: provider.models.map(modelDraftOf),
  };
}

/** The request body of the form; an empty key is left out, which keeps the saved one. */
export function providerInput(draft: ProviderDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    api_format: draft.api_format,
    base_url: draft.base_url.trim(),
    ...(draft.api_key.length > 0 ? { api_key: draft.api_key } : {}),
    is_local: draft.is_local,
    max_parallel_requests: numberOrNull(draft.max_parallel_requests),
    models: draft.models.map((model) => ({
      model_id: model.model_id.trim(),
      cost_tier: model.cost_tier,
      input_price_per_million: numberOrNull(model.input_price_per_million),
      output_price_per_million: numberOrNull(model.output_price_per_million),
      cache_read_price_per_million: numberOrNull(model.cache_read_price_per_million),
      cache_write_price_per_million: numberOrNull(model.cache_write_price_per_million),
      max_output_tokens: optionalNumber(model.max_output_tokens),
      context_window_tokens: optionalNumber(model.context_window_tokens),
    })),
  };
}
