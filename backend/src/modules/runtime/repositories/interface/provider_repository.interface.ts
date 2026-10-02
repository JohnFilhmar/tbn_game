import type { ProviderRecord, ProviderWrite } from '@/modules/runtime/types/provider_record';

/** Injection token for `ProviderRepository`. */
export const PROVIDER_REPOSITORY = Symbol('PROVIDER_REPOSITORY');

/** Provider rows with their models, scoped by owner. */
export interface ProviderRepository {
  list(owner_id: string): Promise<ProviderRecord[]>;
  find(owner_id: string, id: string): Promise<ProviderRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<ProviderRecord | null>;
  create(owner_id: string, data: ProviderWrite): Promise<ProviderRecord>;
  /** Replaces the models when `data.models` is given. Returns null when the row is missing. */
  update(
    owner_id: string,
    id: string,
    data: Partial<ProviderWrite>,
  ): Promise<ProviderRecord | null>;
  /** Returns false when the row is missing. Throws `ProviderInUseError` when an agent uses it. */
  delete(owner_id: string, id: string): Promise<boolean>;
}

/** Raised when a provider that agents still use is deleted. */
export class ProviderInUseError extends Error {
  constructor() {
    super('Provider is used by an agent');
    this.name = 'ProviderInUseError';
  }
}
