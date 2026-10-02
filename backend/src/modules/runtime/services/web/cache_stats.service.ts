import { Inject, Injectable } from '@nestjs/common';
import type { CacheStats } from '@tbn/contracts';
import {
  WEB_CACHE_REPOSITORY,
  type WebCacheRepository,
} from '@/modules/runtime/repositories/interface/web_cache_repository.interface';
import { SearchProviderService } from '../search/search_provider.service';

function hit_rate(hits: number, misses: number): number {
  return hits + misses === 0 ? 0 : hits / (hits + misses);
}

/**
 * What the caches saved: hit rates, the requests and bytes that never went out, and the money
 * those requests would have cost at the price of the provider that would have answered them,
 * the first enabled one with a price.
 */
@Injectable()
export class CacheStatsService {
  constructor(
    @Inject(WEB_CACHE_REPOSITORY) private readonly cache: WebCacheRepository,
    private readonly providers: SearchProviderService,
  ) {}

  async stats(owner_id: string): Promise<CacheStats> {
    const totals = await this.cache.event_totals(owner_id);
    const priced = (await this.providers.enabled_in_order(owner_id)).find(
      (provider) => provider.price_per_thousand_requests !== null,
    );
    const price = priced?.price_per_thousand_requests ?? 0;
    return {
      search: {
        hits: totals.search.hits,
        misses: totals.search.misses,
        hit_rate: hit_rate(totals.search.hits, totals.search.misses),
        requests_saved: totals.search.hits,
        money_saved: (totals.search.hits * price) / 1_000,
      },
      fetch: {
        hits: totals.fetch.hits,
        misses: totals.fetch.misses,
        hit_rate: hit_rate(totals.fetch.hits, totals.fetch.misses),
        bytes_saved: totals.fetch.bytes_saved,
      },
    };
  }
}
