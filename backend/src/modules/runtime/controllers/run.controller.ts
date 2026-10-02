import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdSchema, RunListQuerySchema, type Run, type RunListQuery } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { RunService } from '@/modules/runtime/services/run.service';

/** Runs, and the owner's answer when the runaway guard pauses one. */
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

  /** Lets a run the runaway guard paused go on. */
  @Post(':id/continue')
  @HttpCode(HttpStatus.OK)
  continue(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Run> {
    return this.run_service.continue(owner.id, id);
  }

  /** Ends a paused run and cancels its task. */
  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  stop(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Run> {
    return this.run_service.stop(owner.id, id);
  }
}
