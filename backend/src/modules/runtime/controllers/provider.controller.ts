import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateProviderSchema,
  IdSchema,
  UpdateProviderSchema,
  type CreateProvider,
  type Provider,
  type UpdateProvider,
  type UsageSummary,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { ProviderService } from '@/modules/runtime/services/provider.service';

/** LLM connections. Keys are written here and never read back. */
@Controller('providers')
export class ProviderController {
  constructor(private readonly provider_service: ProviderService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Provider[]> {
    return this.provider_service.list(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateProviderSchema) body: CreateProvider,
  ): Promise<Provider> {
    return this.provider_service.create(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Provider> {
    return this.provider_service.get(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateProviderSchema) body: UpdateProvider,
  ): Promise<Provider> {
    return this.provider_service.update(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.provider_service.delete(owner.id, id);
  }

  /** The owner topped up or fixed the key: clears out-of-credit and the breaker. */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Provider> {
    return this.provider_service.resume(owner.id, id);
  }

  @Get(':id/usage')
  usage(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<UsageSummary> {
    return this.provider_service.usage_summary(owner.id, id);
  }
}
