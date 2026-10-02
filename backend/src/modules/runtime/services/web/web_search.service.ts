import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SearchResult } from '@tbn/contracts';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  WEB_CACHE_REPOSITORY,
  type WebCacheRepository,
} from '@/modules/runtime/repositories/interface/web_cache_repository.interface';
import { SearchProviderError, search_brave, search_searxng } from '../search/search_adapters';
import { SearchProviderService } from '../search/search_provider.service';
import { utc_day } from './utc_day';

/** A search answer: the results, where they came from, and whether the cache answered. */
export interface WebSearchOutcome {
  results: SearchResult[];
  cached: boolean;
  provider_name: string | null;
}

/** Raised when no provider could answer. The message names each one's reason. */
export class WebSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSearchError';
  }
}

/** The cache key of a query: case, surrounding blanks and runs of blanks do not matter. */
export function search_query_key(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Web search for agents: the cache first, then the owner's providers in priority order, skipping
 * one that errors, times out, is rate limited or out of credit. Every hit and miss is counted.
 */
@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  constructor(
    @Inject(WEB_CACHE_REPOSITORY) private readonly cache: WebCacheRepository,
    private readonly providers: SearchProviderService,
    private readonly preferences: PreferenceService,
  ) {}

  /** @throws WebSearchError when the cache has nothing and no provider answers. */
  async search(owner_id: string, query: string, max_results: number): Promise<WebSearchOutcome> {
    const preferences = await this.preferences.get(owner_id);
    const key = search_query_key(query);
    const not_before = new Date(Date.now() - preferences.search_cache_ttl_minutes * 60_000);
    const cached = await this.cache.find_search(owner_id, key, not_before);
    if (cached !== null) {
      await this.cache.count_event(owner_id, 'search', utc_day(), {
        hits: 1,
        misses: 0,
        bytes_saved: 0,
      });
      return { results: cached.results.slice(0, max_results), cached: true, provider_name: null };
    }
    await this.cache.count_event(owner_id, 'search', utc_day(), {
      hits: 0,
      misses: 1,
      bytes_saved: 0,
    });
    const providers = await this.providers.enabled_in_order(owner_id);
    if (providers.length === 0) {
      throw new WebSearchError('No search provider is set up. Ask the owner to add one.');
    }
    const reasons: string[] = [];
    for (const provider of providers) {
      try {
        const results =
          provider.type === 'brave'
            ? await search_brave(provider, this.providers.open_key(provider), query, max_results)
            : await search_searxng(provider, query, max_results);
        await this.cache.store_search(owner_id, provider.id, key, query, results);
        return { results, cached: false, provider_name: provider.name };
      } catch (error: unknown) {
        if (!(error instanceof SearchProviderError)) throw error;
        this.logger.warn(`Search provider ${provider.name} skipped: ${error.message}`);
        reasons.push(`${provider.name}: ${error.message}`);
      }
    }
    throw new WebSearchError(`No search provider answered. ${reasons.join('; ')}`);
  }
}
