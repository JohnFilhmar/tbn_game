import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSearchProvider, SearchProvider, UpdateSearchProvider } from '@tbn/contracts';
import { SecretBoxService } from '@/lib/crypto/secret_box.service';
import {
  SEARCH_PROVIDER_REPOSITORY,
  type SearchProviderRepository,
} from '@/modules/runtime/repositories/interface/search_provider_repository.interface';
import type { SearchProviderRecord } from '@/modules/runtime/types/search_provider_record';

/** The name the stack's own SearXNG is seeded under. */
export const SEARXNG_PROVIDER_NAME = 'SearXNG';

/** Maps a search provider row to the API shape. The key never appears. */
export function to_search_provider_view(record: SearchProviderRecord): SearchProvider {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    base_url: record.base_url,
    api_key_set: record.api_key_ciphertext !== null,
    priority: record.priority,
    enabled: record.enabled,
    price_per_thousand_requests: record.price_per_thousand_requests,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Search providers: the owner's search services, their sealed keys and their order. */
@Injectable()
export class SearchProviderService {
  constructor(
    @Inject(SEARCH_PROVIDER_REPOSITORY) private readonly providers: SearchProviderRepository,
    private readonly secret_box: SecretBoxService,
  ) {}

  async list(owner_id: string): Promise<SearchProvider[]> {
    return (await this.providers.list(owner_id)).map(to_search_provider_view);
  }

  /** @throws NotFoundException when the search provider is missing. */
  async get(owner_id: string, id: string): Promise<SearchProvider> {
    const record = await this.providers.find(owner_id, id);
    if (record === null) throw new NotFoundException('Search provider not found');
    return to_search_provider_view(record);
  }

  /** @throws ConflictException when the name is taken. */
  async create(owner_id: string, input: CreateSearchProvider): Promise<SearchProvider> {
    if ((await this.providers.find_by_name(owner_id, input.name)) !== null) {
      throw new ConflictException('Search provider name is taken');
    }
    const record = await this.providers.create(owner_id, {
      type: input.type,
      name: input.name,
      base_url: input.base_url,
      api_key_ciphertext: input.api_key === undefined ? null : this.secret_box.seal(input.api_key),
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      price_per_thousand_requests: input.price_per_thousand_requests ?? null,
    });
    return to_search_provider_view(record);
  }

  async update(owner_id: string, id: string, input: UpdateSearchProvider): Promise<SearchProvider> {
    if (input.name !== undefined) {
      const same_name = await this.providers.find_by_name(owner_id, input.name);
      if (same_name !== null && same_name.id !== id) {
        throw new ConflictException('Search provider name is taken');
      }
    }
    const record = await this.providers.update(owner_id, id, {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.base_url !== undefined && { base_url: input.base_url }),
      ...(input.api_key !== undefined && {
        api_key_ciphertext: this.secret_box.seal(input.api_key),
      }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.price_per_thousand_requests !== undefined && {
        price_per_thousand_requests: input.price_per_thousand_requests,
      }),
    });
    if (record === null) throw new NotFoundException('Search provider not found');
    return to_search_provider_view(record);
  }

  async delete(owner_id: string, id: string): Promise<void> {
    if (!(await this.providers.delete(owner_id, id))) {
      throw new NotFoundException('Search provider not found');
    }
  }

  /**
   * Adds the stack's SearXNG as a provider, once. `owner_create` calls this when `SEARXNG_URL`
   * is set.
   */
  async seed_searxng(owner_id: string, base_url: string): Promise<SearchProvider | null> {
    if ((await this.providers.find_by_name(owner_id, SEARXNG_PROVIDER_NAME)) !== null) return null;
    return this.create(owner_id, { type: 'searxng', name: SEARXNG_PROVIDER_NAME, base_url });
  }

  /** The enabled providers in the order to try them, for the search tool. */
  async enabled_in_order(owner_id: string): Promise<SearchProviderRecord[]> {
    return (await this.providers.list(owner_id)).filter((record) => record.enabled);
  }

  /** The provider's key, opened right before a request. Null when it has none. */
  open_key(record: SearchProviderRecord): string | null {
    return record.api_key_ciphertext === null
      ? null
      : this.secret_box.open(record.api_key_ciphertext);
  }
}
