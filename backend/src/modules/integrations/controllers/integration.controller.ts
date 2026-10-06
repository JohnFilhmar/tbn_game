import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateIntegrationSchema,
  IdSchema,
  TestIntegrationSchema,
  UpdateIntegrationSchema,
  type CreateIntegration,
  type Integration,
  type IntegrationCallResult,
  type TestIntegration,
  type UpdateIntegration,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { IntegrationService } from '@/modules/integrations/services/integration.service';
import { OwnerOnly } from '@/lib/auth/guest_policy.decorator';

/** Request templates. Tokens are written here and never read back. */
@OwnerOnly()
@Controller('integrations')
export class IntegrationController {
  constructor(private readonly integrations: IntegrationService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Integration[]> {
    return this.integrations.list(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateIntegrationSchema) body: CreateIntegration,
  ): Promise<Integration> {
    return this.integrations.create(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Integration> {
    return this.integrations.get(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateIntegrationSchema) body: UpdateIntegration,
  ): Promise<Integration> {
    return this.integrations.update(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.integrations.delete(owner.id, id);
  }

  /** Sends one call with sample values and returns the status and an excerpt. */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(TestIntegrationSchema) body: TestIntegration,
  ): Promise<IntegrationCallResult> {
    return this.integrations.test(owner.id, id, body.values);
  }
}
