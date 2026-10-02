import { Injectable } from '@nestjs/common';
import { SearchResultSchema, type SearchResult } from '@tbn/contracts';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type {
  CacheEventDelta,
  CacheTotals,
  FetchCacheRecord,
  FetchCacheWrite,
  PageHit,
  SearchCacheRecord,
} from '@/modules/runtime/types/web_cache_record';
import type { WebCacheRepository } from './interface/web_cache_repository.interface';

/** A full-text document stops here: tsvector itself holds at most a megabyte. */
const DOCUMENT_CHARS = 400_000;

const PageHitRowSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  excerpt: z.string(),
  rank: z.number(),
  fetched_at: z.date(),
});

const TotalsRowSchema = z.object({
  kind: z.string(),
  hits: z.coerce.number(),
  misses: z.coerce.number(),
  bytes_saved: z.coerce.number(),
});

function to_search_record(row: {
  id: string;
  owner_id: string;
  provider_id: string | null;
  query_key: string;
  query: string;
  results: unknown;
  created_at: Date;
}): SearchCacheRecord {
  const results = SearchResultSchema.array().safeParse(row.results);
  return { ...row, results: results.success ? results.data : [] };
}

/** `WebCacheRepository` on Prisma. The full-text parts are raw SQL: Prisma has no tsvector. */
@Injectable()
export class PrismaWebCacheRepository implements WebCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find_search(
    owner_id: string,
    query_key: string,
    not_before: Date,
  ): Promise<SearchCacheRecord | null> {
    const row = await this.prisma.searchCache.findFirst({
      where: { owner_id, query_key, created_at: { gte: not_before } },
    });
    return row === null ? null : to_search_record(row);
  }

  async store_search(
    owner_id: string,
    provider_id: string | null,
    query_key: string,
    query: string,
    results: SearchResult[],
  ): Promise<SearchCacheRecord> {
    const row = await this.prisma.searchCache.upsert({
      where: { owner_id_query_key: { owner_id, query_key } },
      create: { owner_id, provider_id, query_key, query, results },
      update: { provider_id, query, results, created_at: new Date() },
    });
    return to_search_record(row);
  }

  find_fetch(owner_id: string, url: string, not_before: Date): Promise<FetchCacheRecord | null> {
    return this.prisma.fetchCache.findFirst({
      where: { owner_id, url, fetched_at: { gte: not_before } },
    });
  }

  async store_fetch(owner_id: string, write: FetchCacheWrite): Promise<FetchCacheRecord> {
    const row = await this.prisma.fetchCache.upsert({
      where: { owner_id_url: { owner_id, url: write.url } },
      create: { owner_id, ...write },
      update: { ...write, fetched_at: new Date() },
    });
    const document = `${write.title ?? ''}\n${write.text}`.slice(0, DOCUMENT_CHARS);
    await this.prisma
      .$executeRaw`UPDATE "fetch_cache" SET "search_vector" = to_tsvector('english', ${document}) WHERE "id" = ${row.id}`;
    return row;
  }

  async count_event(
    owner_id: string,
    kind: 'search' | 'fetch',
    day: Date,
    delta: CacheEventDelta,
  ): Promise<void> {
    await this.prisma.cacheEvent.upsert({
      where: { owner_id_kind_day: { owner_id, kind, day } },
      create: { owner_id, kind, day, ...delta, bytes_saved: BigInt(delta.bytes_saved) },
      update: {
        hits: { increment: delta.hits },
        misses: { increment: delta.misses },
        bytes_saved: { increment: BigInt(delta.bytes_saved) },
      },
    });
  }

  async event_totals(owner_id: string): Promise<CacheTotals> {
    const rows = TotalsRowSchema.array().parse(
      await this.prisma
        .$queryRaw`SELECT "kind", SUM("hits") AS hits, SUM("misses") AS misses, SUM("bytes_saved") AS bytes_saved FROM "cache_events" WHERE "owner_id" = ${owner_id} GROUP BY "kind"`,
    );
    const of = (kind: string): { hits: number; misses: number; bytes_saved: number } =>
      rows.find((row) => row.kind === kind) ?? { hits: 0, misses: 0, bytes_saved: 0 };
    const search = of('search');
    const fetch = of('fetch');
    return {
      search: { hits: search.hits, misses: search.misses },
      fetch: { hits: fetch.hits, misses: fetch.misses, bytes_saved: fetch.bytes_saved },
    };
  }

  async search_pages(owner_id: string, query: string, limit: number): Promise<PageHit[]> {
    return PageHitRowSchema.array().parse(
      await this.prisma.$queryRaw`
        SELECT "url", "title", "fetched_at",
          ts_rank("search_vector", query) AS rank,
          ts_headline('english', "text", query, 'MaxFragments=2, MaxWords=25, MinWords=10') AS excerpt
        FROM "fetch_cache", websearch_to_tsquery('english', ${query}) AS query
        WHERE "owner_id" = ${owner_id} AND "search_vector" @@ query
        ORDER BY rank DESC, "fetched_at" DESC
        LIMIT ${limit}`,
    );
  }
}
