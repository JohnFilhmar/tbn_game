import { Controller, Get } from '@nestjs/common';
import { IdSchema, RunListQuerySchema, type Run, type RunListQuery } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { RunService } from '@/modules/runtime/services/run.service';

/** Runs, read-only. */
@Controller('runs')
export class RunController {
  constructor(private readonly run_service: RunService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(RunListQuerySchema) query: RunListQuery,
  ): Promise<Run[]> {
    return this.run_service.list(owner.id, query);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Run> {
    return this.run_service.get(owner.id, id);
  }
}
