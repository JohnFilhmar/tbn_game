import { Injectable } from '@nestjs/common';
import type { ReportListQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import type { ReportRecord } from '@/modules/company/types/company_records';
import type { ReportRepository } from './interface/report_repository.interface';

/** `ReportRepository` on Prisma. */
@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string, query: ReportListQuery): Promise<ReportRecord[]> {
    return this.prisma.report.findMany({
      where: { owner_id, ...(query.agent_id !== undefined && { agent_id: query.agent_id }) },
      orderBy: { created_at: 'desc' },
    });
  }

  find(owner_id: string, id: string): Promise<ReportRecord | null> {
    return this.prisma.report.findFirst({ where: { id, owner_id } });
  }

  find_by_task(owner_id: string, task_id: string): Promise<ReportRecord | null> {
    return this.prisma.report.findFirst({ where: { owner_id, task_id } });
  }

  create(
    owner_id: string,
    task_id: string,
    agent_id: string,
    body_md: string,
  ): Promise<ReportRecord> {
    return this.prisma.report.create({ data: { owner_id, task_id, agent_id, body_md } });
  }
}
