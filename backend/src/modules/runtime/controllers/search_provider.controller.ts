import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateSearchProviderSchema,
  IdSchema,
  UpdateSearchProviderSchema,
  type CreateSearchProvider,
  type SearchProvider,
  type UpdateSearchProvider,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { SearchProviderService } from '@/modules/runtime/services/search/search_provider.service';

/** Search services. Keys are written here and never read back. */
@Controller('search_providers')
export class SearchProviderController {
  constructor(private readonly providers: SearchProviderService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<SearchProvider[]> {
    return this.providers.list(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreateSearchProviderSchema) body: CreateSearchProvider,
  ): Promise<SearchProvider> {
    return this.providers.create(owner.id, body);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdateSearchProviderSchema) body: UpdateSearchProvider,
  ): Promise<SearchProvider> {
    return this.providers.update(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.providers.delete(owner.id, id);
  }
}
