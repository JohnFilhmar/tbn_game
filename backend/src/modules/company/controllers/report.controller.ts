import { Controller, Get, Header, Res } from '@nestjs/common';
import { IdSchema, ReportListQuerySchema, type Report, type ReportListQuery } from '@tbn/contracts';
import type { Response } from 'express';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { ReportService } from '@/modules/company/services/report.service';

/** Reports of finished tasks, readable as JSON or downloadable as `.md`. */
@Controller('reports')
export class ReportController {
  constructor(private readonly report_service: ReportService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(ReportListQuerySchema) query: ReportListQuery,
  ): Promise<Report[]> {
    return this.report_service.list(owner.id, query);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Report> {
    return this.report_service.get(owner.id, id);
  }

  /** The Markdown body as a file attachment. */
  @Get(':id/download')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async download(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const download = await this.report_service.download(owner.id, id);
    response.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    return download.body_md;
  }
}
