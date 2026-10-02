import type {
  SearchProviderRecord,
  SearchProviderWrite,
} from '@/modules/runtime/types/search_provider_record';

/** Injection token for `SearchProviderRepository`. */
export const SEARCH_PROVIDER_REPOSITORY = Symbol('SEARCH_PROVIDER_REPOSITORY');

/** Search provider rows, scoped by owner, in priority order. */
export interface SearchProviderRepository {
  list(owner_id: string): Promise<SearchProviderRecord[]>;
  find(owner_id: string, id: string): Promise<SearchProviderRecord | null>;
  find_by_name(owner_id: string, name: string): Promise<SearchProviderRecord | null>;
  create(owner_id: string, write: SearchProviderWrite): Promise<SearchProviderRecord>;
  update(
    owner_id: string,
    id: string,
    write: Partial<SearchProviderWrite>,
  ): Promise<SearchProviderRecord | null>;
  /** True when a row was deleted. */
  delete(owner_id: string, id: string): Promise<boolean>;
}
