import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Report, ReportListQuery } from '@tbn/contracts';
import {
  REPORT_REPOSITORY,
  type ReportRepository,
} from '@/modules/company/repositories/interface/report_repository.interface';
import type { ReportRecord } from '@/modules/company/types/company_records';

/** A report ready to download as a `.md` file. */
export interface ReportDownload {
  filename: string;
  body_md: string;
}

/** Maps a report row to the API shape. */
export function to_report_view(record: ReportRecord): Report {
  return {
    id: record.id,
    task_id: record.task_id,
    agent_id: record.agent_id,
    body_md: record.body_md,
    created_at: record.created_at.toISOString(),
  };
}

/** Reports: one Markdown document per finished task. */
@Injectable()
export class ReportService {
  constructor(@Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository) {}

  async list(owner_id: string, query: ReportListQuery): Promise<Report[]> {
    return (await this.reports.list(owner_id, query)).map(to_report_view);
  }

  async get(owner_id: string, id: string): Promise<Report> {
    return to_report_view(await this.require(owner_id, id));
  }

  async download(owner_id: string, id: string): Promise<ReportDownload> {
    const record = await this.require(owner_id, id);
    return { filename: `report-${record.id}.md`, body_md: record.body_md };
  }

  /**
   * Stores the report of a finished task, for the runtime.
   *
   * @throws ConflictException when the task already has one.
   */
  async create_for_task(
    owner_id: string,
    task_id: string,
    agent_id: string,
    body_md: string,
  ): Promise<Report> {
    if ((await this.reports.find_by_task(owner_id, task_id)) !== null) {
      throw new ConflictException('Task already has a report');
    }
    return to_report_view(await this.reports.create(owner_id, task_id, agent_id, body_md));
  }

  private async require(owner_id: string, id: string): Promise<ReportRecord> {
    const record = await this.reports.find(owner_id, id);
    if (record === null) throw new NotFoundException('Report not found');
    return record;
  }
}
