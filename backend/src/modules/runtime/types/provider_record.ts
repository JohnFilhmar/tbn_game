import type { ApiFormat, CostTier } from '@tbn/contracts';
import type { CapWindowWrite } from './cap_window_record';

/** A provider model row. */
export interface ProviderModelRecord {
  model_id: string;
  cost_tier: CostTier;
  input_price_per_million: number | null;
  output_price_per_million: number | null;
  cache_read_price_per_million: number | null;
  cache_write_price_per_million: number | null;
  max_output_tokens: number;
  context_window_tokens: number;
}

/** The runtime's own state of a provider key: its circuit breaker and its credit. */
export interface ProviderState {
  breaker_failures: number;
  breaker_open_until: Date | null;
  out_of_credit_since: Date | null;
}

/** A provider row with its models. The key stays sealed. */
export interface ProviderRecord extends ProviderState {
  id: string;
  owner_id: string;
  name: string;
  api_format: ApiFormat;
  base_url: string;
  api_key_ciphertext: string;
  is_local: boolean;
  max_parallel_requests: number | null;
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
  is_local: boolean;
  max_parallel_requests: number | null;
  models: ProviderModelRecord[];
}

/** What a new provider is created with: its fields and its first cap windows. */
export interface ProviderCreate extends ProviderWrite {
  cap_windows: CapWindowWrite[];
}

/** What the provider client needs to call a provider. Never leaves the runtime. */
export interface ProviderConnection {
  provider_id: string;
  api_format: ApiFormat;
  base_url: string;
  api_key: string;
  model: ProviderModelRecord;
  max_parallel_requests: number | null;
  state: ProviderState;
}
