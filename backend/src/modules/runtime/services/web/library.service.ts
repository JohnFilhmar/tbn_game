import { Inject, Injectable } from '@nestjs/common';
import { ReportService } from '@/modules/company/services/report.service';
import {
  WEB_CACHE_REPOSITORY,
  type WebCacheRepository,
} from '@/modules/runtime/repositories/interface/web_cache_repository.interface';

/** How many hits of each kind one query returns at most. */
const HITS_PER_KIND = 8;

/** One thing the library found: a cached page or a report. */
export interface LibraryHit {
  kind: 'page' | 'report';
  title: string;
  /** The page's URL, or the report's id. */
  reference: string;
  excerpt: string;
  rank: number;
  at: Date;
}

/**
 * The research library: a full-text search over every page the company has read and every
 * report it has written. Agents look here before they search the web.
 */
@Injectable()
export class LibraryService {
  constructor(
    @Inject(WEB_CACHE_REPOSITORY) private readonly cache: WebCacheRepository,
    private readonly reports: ReportService,
  ) {}

  /** Pages and reports matching the query, best first. */
  async search(owner_id: string, query: string): Promise<LibraryHit[]> {
    const [pages, reports] = await Promise.all([
      this.cache.search_pages(owner_id, query, HITS_PER_KIND),
      this.reports.search(owner_id, query, HITS_PER_KIND),
    ]);
    const hits: LibraryHit[] = [
      ...pages.map((page): LibraryHit => ({
        kind: 'page',
        title: page.title ?? page.url,
        reference: page.url,
        excerpt: page.excerpt,
        rank: page.rank,
        at: page.fetched_at,
      })),
      ...reports.map((report): LibraryHit => ({
        kind: 'report',
        title: `Report of task ${report.task_id}`,
        reference: report.id,
        excerpt: report.excerpt,
        rank: report.rank,
        at: report.created_at,
      })),
    ];
    return hits.sort((a, b) => b.rank - a.rank || b.at.getTime() - a.at.getTime());
  }
}
