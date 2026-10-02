import type { ApiFormat, CostTier } from '@tbn/contracts';

/** A provider model row. */
export interface ProviderModelRecord {
  model_id: string;
  cost_tier: CostTier;
  input_price_per_million: number | null;
  output_price_per_million: number | null;
  cache_read_price_per_million: number | null;
  cache_write_price_per_million: number | null;
  max_output_tokens: number;
}

/** A provider row with its models. The key stays sealed. */
export interface ProviderRecord {
  id: string;
  owner_id: string;
  name: string;
  api_format: ApiFormat;
  base_url: string;
  api_key_ciphertext: string;
  models: ProviderModelRecord[];
  created_at: Date;
  updated_at: Date;
}

/** Fields written when a provider is created or updated. */
export interface ProviderWrite {
  name: string;
  api_format: ApiFormat;
  base_url: string;
  api_key_ciphertext: string;
  models: ProviderModelRecord[];
}

/** What the provider client needs to call a provider. Never leaves the runtime. */
export interface ProviderConnection {
  provider_id: string;
  api_format: ApiFormat;
  base_url: string;
  api_key: string;
  model: ProviderModelRecord;
}
