import type {
  ProviderCreate,
  ProviderRecord,
  ProviderState,
  ProviderWrite,
} from '@/modules/runtime/types/provider_record';

/** Injection token for `ProviderRepository`. */
export const PROVIDER_REPOSITORY = Symbol('PROVIDER_REPOSITORY');

/** Provider rows with their models, scoped by owner. */
export interface ProviderRepository {
  list(owner_id: string): Promise<ProviderRecord[]>;
  find(owner_id: string, id: string): Promise<ProviderRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<ProviderRecord | null>;
  /** The provider marked local, or null. */
  find_local(owner_id: string): Promise<ProviderRecord | null>;
  /** Creates the provider with its models and cap windows. Marking it local unmarks the others. */
  create(owner_id: string, data: ProviderCreate): Promise<ProviderRecord>;
  /**
   * Replaces the models when `data.models` is given, and unmarks the other providers when it marks
   * this one local. Returns null when the row is missing.
   */
  update(
    owner_id: string,
    id: string,
    data: Partial<ProviderWrite>,
  ): Promise<ProviderRecord | null>;
  /** Returns false when the row is missing. Throws `ProviderInUseError` when an agent uses it. */
  delete(owner_id: string, id: string): Promise<boolean>;
  /**
   * Counts one more consecutive failure and opens the breaker until `open_until` once the count
   * reaches `threshold`. Returns the new state, or null when the row is missing.
   */
  record_failure(
    owner_id: string,
    id: string,
    threshold: number,
    open_until: Date,
  ): Promise<ProviderState | null>;
  /** Holds every call on the key until `until`, unless it is already held longer. */
  hold_until(owner_id: string, id: string, until: Date): Promise<void>;
  /** Closes the breaker and resets its count. */
  record_success(owner_id: string, id: string): Promise<void>;
  /** Marks the key out of credit from `at`, unless it already is. */
  mark_out_of_credit(owner_id: string, id: string, at: Date): Promise<void>;
  /** Clears the breaker and the out-of-credit mark. Returns false when the row is missing. */
  clear_state(owner_id: string, id: string): Promise<boolean>;
}

/** Raised when a provider that agents still use is deleted. */
export class ProviderInUseError extends Error {
  constructor() {
    super('Provider is used by an agent');
    this.name = 'ProviderInUseError';
  }
}
