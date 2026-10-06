import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreateCapWindowSchema,
  IdSchema,
  UpdateCapWindowSchema,
  type CapWindowStatus,
  type CreateCapWindow,
  type UpdateCapWindow,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { CapWindowService } from '@/modules/runtime/services/caps/cap_window.service';
import { OwnerOnly } from '@/lib/auth/guest_policy.decorator';

/** Usage caps on one provider key, with their live usage. */
@OwnerOnly()
@Controller('providers/:id/cap_windows')
export class CapWindowController {
  constructor(private readonly cap_window_service: CapWindowService) {}

  @Get()
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) provider_id: string,
  ): Promise<CapWindowStatus[]> {
    return this.cap_window_service.list(owner.id, provider_id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) provider_id: string,
    @ZodBody(CreateCapWindowSchema) body: CreateCapWindow,
  ): Promise<CapWindowStatus> {
    return this.cap_window_service.create(owner.id, provider_id, body);
  }

  @Patch(':window_id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) provider_id: string,
    @ZodParam('window_id', IdSchema) window_id: string,
    @ZodBody(UpdateCapWindowSchema) body: UpdateCapWindow,
  ): Promise<CapWindowStatus> {
    return this.cap_window_service.update(owner.id, provider_id, window_id, body);
  }

  @Delete(':window_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) provider_id: string,
    @ZodParam('window_id', IdSchema) window_id: string,
  ): Promise<void> {
    return this.cap_window_service.delete(owner.id, provider_id, window_id);
  }
}
