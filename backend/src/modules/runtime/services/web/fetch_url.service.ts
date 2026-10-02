import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { EgressRefusedError, request_through_proxy } from '@/lib/egress_proxy/proxied_request';
import { collapse_whitespace, extract_html_text } from '@/lib/html_text/extract_text';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  WEB_CACHE_REPOSITORY,
  type WebCacheRepository,
} from '@/modules/runtime/repositories/interface/web_cache_repository.interface';
import type { FetchCacheRecord } from '@/modules/runtime/types/web_cache_record';
import { utc_day } from './utc_day';

/** How long one page may take to arrive. */
const FETCH_TIMEOUT_MS = 30_000;

/** How many redirects a fetch follows. */
const MAX_REDIRECTS = 5;

/** Content types the fetch tool reads. HTML is distilled; the rest is text already. */
const TEXT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/xml',
  'application/xml',
  'application/json',
  'application/ld+json',
  'application/rss+xml',
  'application/atom+xml',
];

/** A page as the agent gets it. */
export interface FetchedPage {
  url: string;
  title: string | null;
  content_type: string;
  text: string;
  /** True when the text was cut at the owner's character limit. */
  truncated: boolean;
  cached: boolean;
  fetched_at: Date;
}

/** Raised when a URL cannot be fetched: refused by the proxy, unsupported, or an error status. */
export class FetchUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchUrlError';
  }
}

/** The identity the proxy logs and limits by. */
export interface FetchIdentity {
  run_id: string;
  agent_id: string;
}

/** The URL as the cache keys it: no fragment. */
export function cache_url(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

function media_type(content_type: string | undefined): string {
  return (content_type ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Fetches pages for agents through the egress proxy, with the run's identity, and keeps their
 * text in the page cache. A raw response never reaches the model: HTML becomes text, and every
 * other accepted type is text already, cut at the owner's limit.
 */
@Injectable()
export class FetchUrlService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(WEB_CACHE_REPOSITORY) private readonly cache: WebCacheRepository,
    private readonly preferences: PreferenceService,
  ) {}

  /**
   * The page, from the cache when it is inside its lifetime and `fresh` is false.
   *
   * @throws FetchUrlError when the page cannot be read.
   */
  async fetch(
    owner_id: string,
    identity: FetchIdentity,
    url: string,
    fresh: boolean,
  ): Promise<FetchedPage> {
    const preferences = await this.preferences.get(owner_id);
    const key = cache_url(url);
    if (!fresh) {
      const not_before = new Date(Date.now() - preferences.fetch_cache_ttl_minutes * 60_000);
      const cached = await this.cache.find_fetch(owner_id, key, not_before);
      if (cached !== null) {
        await this.cache.count_event(owner_id, 'fetch', utc_day(), {
          hits: 1,
          misses: 0,
          bytes_saved: cached.bytes,
        });
        return this.to_page(cached, preferences.fetch_max_chars, true);
      }
    }
    await this.cache.count_event(owner_id, 'fetch', utc_day(), {
      hits: 0,
      misses: 1,
      bytes_saved: 0,
    });
    const fetched = await this.fetch_through_proxy(identity, key);
    const stored = await this.cache.store_fetch(owner_id, fetched);
    return this.to_page(stored, preferences.fetch_max_chars, false);
  }

  private to_page(record: FetchCacheRecord, max_chars: number, cached: boolean): FetchedPage {
    return {
      url: record.url,
      title: record.title,
      content_type: record.content_type,
      text: record.text.length > max_chars ? record.text.slice(0, max_chars) : record.text,
      truncated: record.text.length > max_chars,
      cached,
      fetched_at: record.fetched_at,
    };
  }

  private async fetch_through_proxy(
    identity: FetchIdentity,
    url: string,
  ): Promise<{
    url: string;
    title: string | null;
    content_type: string;
    text: string;
    bytes: number;
  }> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let response;
      try {
        response = await request_through_proxy({
          proxy_url: this.config.egress.url,
          identity,
          url: current,
          headers: { accept: 'text/html, text/plain;q=0.9, application/json;q=0.8, */*;q=0.5' },
          max_bytes: this.config.fetch.max_bytes,
          timeout_ms: FETCH_TIMEOUT_MS,
        });
      } catch (error: unknown) {
        if (error instanceof EgressRefusedError) {
          throw new FetchUrlError(`${current} was refused: ${error.message}`);
        }
        throw new FetchUrlError(
          `${current} could not be fetched: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      const location = response.headers['location'];
      if (response.status >= 300 && response.status < 400 && typeof location === 'string') {
        current = cache_url(new URL(location, current).toString());
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new FetchUrlError(`${current} answered HTTP ${response.status}`);
      }
      const type = media_type(response.headers['content-type']);
      if (!TEXT_TYPES.includes(type)) {
        throw new FetchUrlError(
          `${current} is ${type || 'of an unknown type'}, which the fetch tool does not read`,
        );
      }
      const body = response.body.toString('utf8');
      const extracted =
        type === 'text/html' || type === 'application/xhtml+xml'
          ? extract_html_text(body)
          : { title: null, text: collapse_whitespace(body) };
      return {
        url,
        title: extracted.title,
        content_type: type,
        text: response.truncated
          ? `${extracted.text}\n... the page was cut at ${this.config.fetch.max_bytes} bytes`
          : extracted.text,
        bytes: response.body.length,
      };
    }
    throw new FetchUrlError(`${url} redirected more than ${MAX_REDIRECTS} times`);
  }
}
