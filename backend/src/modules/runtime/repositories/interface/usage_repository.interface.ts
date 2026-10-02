import type { UsageRecordWrite, UsageTotals } from '@/modules/runtime/types/usage_record';

/** Injection token for `UsageRepository`. */
export const USAGE_REPOSITORY = Symbol('USAGE_REPOSITORY');

/** Usage per model of one provider. */
export interface ModelUsageTotals extends UsageTotals {
  model_id: string;
}

/** Usage rows, the runtime's own record of tokens, requests and cost per key. */
export interface UsageRepository {
  create(record: UsageRecordWrite): Promise<void>;
  summarize_by_model(owner_id: string, provider_id: string): Promise<ModelUsageTotals[]>;
}
