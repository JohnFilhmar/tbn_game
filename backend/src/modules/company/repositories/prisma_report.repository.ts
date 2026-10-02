import { Injectable } from '@nestjs/common';
import type { ReportListQuery } from '@tbn/contracts';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type { ReportHit, ReportRecord } from '@/modules/company/types/company_records';
import type { ReportRepository } from './interface/report_repository.interface';

/** A full-text document stops here: tsvector itself holds at most a megabyte. */
const DOCUMENT_CHARS = 400_000;

const ReportHitRowSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  agent_id: z.string(),
  excerpt: z.string(),
  rank: z.number(),
  created_at: z.date(),
});

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

  /** Writes the report and its full-text document. Prisma has no tsvector, so that part is SQL. */
  async create(
    owner_id: string,
    task_id: string,
    agent_id: string,
    body_md: string,
  ): Promise<ReportRecord> {
    const report = await this.prisma.report.create({
      data: { owner_id, task_id, agent_id, body_md },
    });
    const document = body_md.slice(0, DOCUMENT_CHARS);
    await this.prisma
      .$executeRaw`UPDATE "reports" SET "search_vector" = to_tsvector('english', ${document}) WHERE "id" = ${report.id}`;
    return report;
  }

  async search(owner_id: string, query: string, limit: number): Promise<ReportHit[]> {
    return ReportHitRowSchema.array().parse(
      await this.prisma.$queryRaw`
        SELECT "id", "task_id", "agent_id", "created_at",
          ts_rank("search_vector", query) AS rank,
          ts_headline('english', "body_md", query, 'MaxFragments=2, MaxWords=25, MinWords=10') AS excerpt
        FROM "reports", websearch_to_tsquery('english', ${query}) AS query
        WHERE "owner_id" = ${owner_id} AND "search_vector" @@ query
        ORDER BY rank DESC, "created_at" DESC
        LIMIT ${limit}`,
    );
  }
}
