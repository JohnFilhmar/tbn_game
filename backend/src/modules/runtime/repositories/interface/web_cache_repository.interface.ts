import type { SearchResult } from '@tbn/contracts';
import type {
  CacheEventDelta,
  CacheTotals,
  FetchCacheRecord,
  FetchCacheWrite,
  PageHit,
  SearchCacheRecord,
} from '@/modules/runtime/types/web_cache_record';

/** Injection token for `WebCacheRepository`. */
export const WEB_CACHE_REPOSITORY = Symbol('WEB_CACHE_REPOSITORY');

/** The search cache, the page cache, the daily counters and the full-text index over pages. */
export interface WebCacheRepository {
  /** The cached search for the key, when it was stored after `not_before`. */
  find_search(
    owner_id: string,
    query_key: string,
    not_before: Date,
  ): Promise<SearchCacheRecord | null>;
  /** Stores or replaces the cached search for the key. */
  store_search(
    owner_id: string,
    provider_id: string | null,
    query_key: string,
    query: string,
    results: SearchResult[],
  ): Promise<SearchCacheRecord>;
  /** The cached page for the URL, when it was fetched after `not_before`. */
  find_fetch(owner_id: string, url: string, not_before: Date): Promise<FetchCacheRecord | null>;
  /** Stores or replaces the cached page and its full-text document. */
  store_fetch(owner_id: string, write: FetchCacheWrite): Promise<FetchCacheRecord>;
  /** Adds to the day's counters of one cache: `search` or `fetch`. */
  count_event(
    owner_id: string,
    kind: 'search' | 'fetch',
    day: Date,
    delta: CacheEventDelta,
  ): Promise<void>;
  event_totals(owner_id: string): Promise<CacheTotals>;
  /** Cached pages matching a web-search style query, best first. */
  search_pages(owner_id: string, query: string, limit: number): Promise<PageHit[]>;
}
