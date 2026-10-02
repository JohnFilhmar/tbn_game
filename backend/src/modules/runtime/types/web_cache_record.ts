import type { SearchResult } from '@tbn/contracts';

/** A cached search row. */
export interface SearchCacheRecord {
  id: string;
  owner_id: string;
  provider_id: string | null;
  query_key: string;
  query: string;
  results: SearchResult[];
  created_at: Date;
}

/** A cached page row. */
export interface FetchCacheRecord {
  id: string;
  owner_id: string;
  url: string;
  title: string | null;
  content_type: string;
  text: string;
  /** Size of the raw response, for the bytes-saved figure. */
  bytes: number;
  fetched_at: Date;
}

/** Fields written when a page is cached. */
export interface FetchCacheWrite {
  url: string;
  title: string | null;
  content_type: string;
  text: string;
  bytes: number;
}

/** What one search or fetch added to the day's counts. */
export interface CacheEventDelta {
  hits: number;
  misses: number;
  bytes_saved: number;
}

/** Hits and misses of each cache over every day. */
export interface CacheTotals {
  search: { hits: number; misses: number };
  fetch: { hits: number; misses: number; bytes_saved: number };
}

/** A cached page the library found. */
export interface PageHit {
  url: string;
  title: string | null;
  excerpt: string;
  rank: number;
  fetched_at: Date;
}
