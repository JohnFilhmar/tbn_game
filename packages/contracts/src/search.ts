import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** The two search adapters: the Brave Search API and a SearXNG instance. */
export const SearchProviderTypeSchema = z.enum(['brave', 'searxng']);

/** `brave` or `searxng`. */
export type SearchProviderType = z.infer<typeof SearchProviderTypeSchema>;

/**
 * A search provider. The key is write-only, like a provider's. Lower `priority` is tried first,
 * and the next provider is tried when one fails. The optional price feeds the savings figure.
 */
export const SearchProviderSchema = z.strictObject({
  id: IdSchema,
  type: SearchProviderTypeSchema,
  name: z.string().trim().min(1).max(100),
  base_url: z.url({ protocol: /^https?$/ }),
  api_key_set: z.boolean(),
  priority: z.number().int().min(0).max(1_000),
  enabled: z.boolean(),
  price_per_thousand_requests: z.number().min(0).max(1_000_000).nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A search provider as the API returns it. */
export type SearchProvider = z.infer<typeof SearchProviderSchema>;

/** Body of `POST /search_providers`. */
export const CreateSearchProviderSchema = SearchProviderSchema.pick({
  type: true,
  name: true,
  base_url: true,
  priority: true,
  enabled: true,
  price_per_thousand_requests: true,
})
  .partial({ priority: true, enabled: true, price_per_thousand_requests: true })
  .extend({ api_key: z.string().min(1).max(4_096).optional() });

/** Body of `POST /search_providers`. */
export type CreateSearchProvider = z.infer<typeof CreateSearchProviderSchema>;

/** Body of `PATCH /search_providers/:id`. */
export const UpdateSearchProviderSchema = CreateSearchProviderSchema.partial();

/** Body of `PATCH /search_providers/:id`. */
export type UpdateSearchProvider = z.infer<typeof UpdateSearchProviderSchema>;

/** One web search result, the same shape from every adapter. */
export const SearchResultSchema = z.strictObject({
  title: z.string(),
  url: z.url(),
  snippet: z.string(),
});

/** A search result. */
export type SearchResult = z.infer<typeof SearchResultSchema>;

const HitRateSchema = z.strictObject({
  hits: z.number().int().min(0),
  misses: z.number().int().min(0),
  hit_rate: z.number().min(0).max(1),
});

/** Response of `GET /caches/stats`: what the caches saved since the start. */
export const CacheStatsSchema = z.strictObject({
  search: HitRateSchema.extend({
    requests_saved: z.number().int().min(0),
    money_saved: z.number().min(0),
  }),
  fetch: HitRateSchema.extend({
    bytes_saved: z.number().int().min(0),
  }),
});

/** Cache statistics. */
export type CacheStats = z.infer<typeof CacheStatsSchema>;
