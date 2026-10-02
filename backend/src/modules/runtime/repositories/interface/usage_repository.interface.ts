import type { CapUnit } from '@tbn/contracts';
import type { UsageRecordWrite, UsageTotals } from '@/modules/runtime/types/usage_record';

/** Injection token for `UsageRepository`. */
export const USAGE_REPOSITORY = Symbol('USAGE_REPOSITORY');

/** Usage per model of one provider. */
export interface ModelUsageTotals extends UsageTotals {
  model_id: string;
}

/** Which usage a cap window counts: one key, optionally one model, after an instant. */
export interface UsageScope {
  owner_id: string;
  provider_id: string;
  /** Null counts every model on the key. */
  model_id: string | null;
  unit: CapUnit;
  /** Only usage recorded strictly after this instant counts. */
  after: Date;
}

/** Usage rows, the runtime's own record of tokens, requests and cost per key. */
export interface UsageRepository {
  create(record: UsageRecordWrite): Promise<void>;
  summarize_by_model(owner_id: string, provider_id: string): Promise<ModelUsageTotals[]>;
  summarize_for_run(owner_id: string, run_id: string): Promise<UsageTotals>;
  /** Totals over several runs, for a report that covers a task and its subtasks. */
  summarize_for_runs(owner_id: string, run_ids: string[]): Promise<UsageTotals>;
  /** Usage in `scope`, in its unit: requests, input plus output tokens, or cost. */
  amount(scope: UsageScope): Promise<number>;
  /**
   * The time of the oldest usage row in `scope` whose leaving the window brings the amount down by
   * more than `excess`, or null when no such row exists. A rolling window at its limit drops
   * below it one window length after that time.
   */
  oldest_beyond(scope: UsageScope, excess: number): Promise<Date | null>;
}
