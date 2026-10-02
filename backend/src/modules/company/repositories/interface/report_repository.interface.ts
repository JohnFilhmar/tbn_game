import type { ReportListQuery } from '@tbn/contracts';
import type { ReportHit, ReportRecord } from '@/modules/company/types/company_records';

/** Injection token for `ReportRepository`. */
export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

/** Report rows, scoped by owner. One report per task. */
export interface ReportRepository {
  list(owner_id: string, query: ReportListQuery): Promise<ReportRecord[]>;
  find(owner_id: string, id: string): Promise<ReportRecord | null>;
  find_by_task(owner_id: string, task_id: string): Promise<ReportRecord | null>;
  create(
    owner_id: string,
    task_id: string,
    agent_id: string,
    body_md: string,
  ): Promise<ReportRecord>;
  /** Reports matching a web-search style query, best first, for the research library. */
  search(owner_id: string, query: string, limit: number): Promise<ReportHit[]>;
}
