import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** The two API formats, each one adapter behind the provider interface. */
export const ApiFormatSchema = z.enum(['anthropic_messages', 'openai_chat_completions']);

/** `anthropic_messages` or `openai_chat_completions`. */
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

/** Relative cost of a model, used to pick cheaper models for interns. */
export const CostTierSchema = z.enum(['cheap', 'standard', 'premium']);

/** `cheap`, `standard` or `premium`. */
export type CostTier = z.infer<typeof CostTierSchema>;

/** A model id as the provider names it. */
export const ModelIdSchema = z.string().trim().min(1).max(200);

const PriceSchema = z.number().min(0).max(1_000_000).nullable();

/** One model offered by a provider, with optional prices per million tokens. */
export const ProviderModelSchema = z.strictObject({
  model_id: ModelIdSchema,
  cost_tier: CostTierSchema,
  input_price_per_million: PriceSchema,
  output_price_per_million: PriceSchema,
  cache_read_price_per_million: PriceSchema,
  cache_write_price_per_million: PriceSchema,
  max_output_tokens: z.number().int().min(1).max(200_000),
  context_window_tokens: z.number().int().min(1_000).max(10_000_000),
});

/** One model offered by a provider. */
export type ProviderModel = z.infer<typeof ProviderModelSchema>;

/**
 * A model as written. Prices default to unknown, the output limit to 8192 and the context window to
 * 128000 tokens.
 */
export const ProviderModelWriteSchema = ProviderModelSchema.partial({
  input_price_per_million: true,
  output_price_per_million: true,
  cache_read_price_per_million: true,
  cache_write_price_per_million: true,
  max_output_tokens: true,
  context_window_tokens: true,
});

/** A model as written. */
export type ProviderModelWrite = z.infer<typeof ProviderModelWriteSchema>;

/** True when no two models share a model id. */
function has_unique_model_ids(models: readonly { model_id: string }[]): boolean {
  return new Set(models.map((model) => model.model_id)).size === models.length;
}

const UNIQUE_MODEL_IDS = { message: 'model_id must be unique within a provider' };

/**
 * An LLM connection. The API key is write-only: it is encrypted at rest and never returned,
 * and `api_key_set` says whether there is one; a local model such as Ollama may take none. `is_local` marks the one provider new interns fall back to
 * when a key passes its cap threshold. `breaker_open_until` and `out_of_credit_since` are the
 * runtime's own state and read-only.
 */
export const ProviderSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(100),
  api_format: ApiFormatSchema,
  base_url: z.url({ protocol: /^https?$/ }),
  api_key_set: z.boolean(),
  models: z
    .array(ProviderModelSchema)
    .min(1)
    .max(50)
    .refine(has_unique_model_ids, UNIQUE_MODEL_IDS),
  is_local: z.boolean(),
  max_parallel_requests: z.number().int().min(1).max(1_000).nullable(),
  breaker_open_until: DateTimeSchema.nullable(),
  out_of_credit_since: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** An LLM connection as the API returns it. */
export type Provider = z.infer<typeof ProviderSchema>;

/** Body of `POST /providers`. The key is the one write-only field added to the model. */
export const CreateProviderSchema = ProviderSchema.pick({
  name: true,
  api_format: true,
  base_url: true,
  is_local: true,
  max_parallel_requests: true,
})
  .partial({ is_local: true, max_parallel_requests: true })
  .extend({
    api_key: z.string().min(1).max(4_096).optional(),
    models: z
      .array(ProviderModelWriteSchema)
      .min(1)
      .max(50)
      .refine(has_unique_model_ids, UNIQUE_MODEL_IDS),
  });

/** Body of `POST /providers`. */
export type CreateProvider = z.infer<typeof CreateProviderSchema>;

/** Body of `PATCH /providers/:id`. Sending `models` replaces the whole list. */
export const UpdateProviderSchema = CreateProviderSchema.partial();

/** Body of `PATCH /providers/:id`. */
export type UpdateProvider = z.infer<typeof UpdateProviderSchema>;

const UsageTotalsSchema = z.strictObject({
  requests: z.number().int().min(0),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cache_read_tokens: z.number().int().min(0),
  cache_write_tokens: z.number().int().min(0),
  cost: z.number().min(0),
});

/** Totals the runtime counted for one provider key from its own records. */
export const UsageSummarySchema = UsageTotalsSchema.extend({
  provider_id: IdSchema,
  by_model: z.array(UsageTotalsSchema.extend({ model_id: ModelIdSchema })),
});

/** Response of `GET /providers/:id/usage`. */
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
