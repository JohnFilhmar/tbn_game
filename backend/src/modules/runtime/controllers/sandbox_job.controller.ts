import { Controller, Get } from '@nestjs/common';
import {
  IdSchema,
  SandboxJobListQuerySchema,
  type SandboxJob,
  type SandboxJobListQuery,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodParam, ZodQuery } from '@/lib/validation/zod.decorator';
import { SandboxJobService } from '@/modules/runtime/services/sandbox/sandbox_job.service';

/** Sandbox jobs as the owner reads them: what ran, how it ended, and its capped output. */
@Controller('sandbox_jobs')
export class SandboxJobController {
  constructor(private readonly jobs: SandboxJobService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodQuery(SandboxJobListQuerySchema) query: SandboxJobListQuery,
  ): Promise<SandboxJob[]> {
    return this.jobs.list(owner.id, query);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<SandboxJob> {
    return this.jobs.get(owner.id, id);
  }
}
