/** Token counts of one model call. */
export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/** One usage row, written after every successful model call. */
export interface UsageRecordWrite extends ModelUsage {
  owner_id: string;
  provider_id: string;
  model_id: string;
  agent_id: string;
  run_id: string | null;
  cost: number;
}

/** Summed usage, overall or for one model. */
export interface UsageTotals extends ModelUsage {
  requests: number;
  cost: number;
}
