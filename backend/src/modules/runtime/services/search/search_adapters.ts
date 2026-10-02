import type { SearchResult } from '@tbn/contracts';
import { z } from 'zod';
import type { SearchProviderRecord } from '@/modules/runtime/types/search_provider_record';

/** How long one search request may take. */
export const SEARCH_TIMEOUT_MS = 10_000;

const BraveReplySchema = z.looseObject({
  web: z
    .looseObject({
      results: z.array(
        z.looseObject({
          title: z.string().default(''),
          url: z.string(),
          description: z.string().default(''),
        }),
      ),
    })
    .optional(),
});

const SearxngReplySchema = z.looseObject({
  results: z.array(
    z.looseObject({
      title: z.string().default(''),
      url: z.string(),
      content: z.string().default(''),
    }),
  ),
});

/** Raised when a provider did not answer with results; the next provider is tried. */
export class SearchProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'SearchProviderError';
  }
}

function strip_tags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function valid_results(rows: { title: string; url: string; snippet: string }[]): SearchResult[] {
  return rows.flatMap((row) => {
    const parsed = z.url().safeParse(row.url);
    if (!parsed.success) return [];
    return [{ title: strip_tags(row.title), url: parsed.data, snippet: strip_tags(row.snippet) }];
  });
}

async function get_json(
  provider: SearchProviderRecord,
  url: URL,
  headers: Record<string, string>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      redirect: 'manual',
    });
  } catch (error: unknown) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `no answer in ${SEARCH_TIMEOUT_MS / 1_000} s`
        : error instanceof Error
          ? error.message
          : 'unknown error';
    throw new SearchProviderError(provider.name, reason);
  }
  if (!response.ok) {
    const why =
      response.status === 429
        ? 'rate limited'
        : response.status === 402
          ? 'out of credit'
          : response.status === 401 || response.status === 403
            ? 'the key was refused'
            : `HTTP ${response.status}`;
    throw new SearchProviderError(provider.name, why);
  }
  try {
    return await response.json();
  } catch {
    throw new SearchProviderError(provider.name, 'the reply was not JSON');
  }
}

/** Brave Search's web search API: `GET /res/v1/web/search` with the subscription token. */
export async function search_brave(
  provider: SearchProviderRecord,
  api_key: string | null,
  query: string,
  count: number,
): Promise<SearchResult[]> {
  if (api_key === null) throw new SearchProviderError(provider.name, 'it has no key');
  const url = new URL('res/v1/web/search', `${provider.base_url.replace(/\/?$/, '/')}`);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  const reply = BraveReplySchema.safeParse(
    await get_json(provider, url, { 'x-subscription-token': api_key }),
  );
  if (!reply.success) throw new SearchProviderError(provider.name, 'the reply had no results');
  return valid_results(
    (reply.data.web?.results ?? []).map((row) => ({
      title: row.title,
      url: row.url,
      snippet: row.description,
    })),
  ).slice(0, count);
}

/** A SearXNG instance's JSON format: `GET /search?format=json`. */
export async function search_searxng(
  provider: SearchProviderRecord,
  query: string,
  count: number,
): Promise<SearchResult[]> {
  const url = new URL('search', `${provider.base_url.replace(/\/?$/, '/')}`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  const reply = SearxngReplySchema.safeParse(await get_json(provider, url, {}));
  if (!reply.success) throw new SearchProviderError(provider.name, 'the reply had no results');
  return valid_results(
    reply.data.results.map((row) => ({ title: row.title, url: row.url, snippet: row.content })),
  ).slice(0, count);
}
