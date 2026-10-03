import { Controller, Delete, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import {
  EnvironmentNameSchema,
  SaveWorldLayoutSchema,
  type EnvironmentName,
  type SaveWorldLayout,
  type WorldLayout,
  type WorldLayoutResponse,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { WorldLayoutService } from '@/modules/world/services/world_layout.service';

/** Each environment as the owner arranged and painted it. */
@Controller('world')
export class WorldController {
  constructor(private readonly world_layouts: WorldLayoutService) {}

  @Get(':environment')
  async get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('environment', EnvironmentNameSchema) environment: EnvironmentName,
  ): Promise<WorldLayoutResponse> {
    return { layout: await this.world_layouts.get(owner.id, environment) };
  }

  @Put(':environment')
  save(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('environment', EnvironmentNameSchema) environment: EnvironmentName,
    @ZodBody(SaveWorldLayoutSchema) body: SaveWorldLayout,
  ): Promise<WorldLayout> {
    return this.world_layouts.save(owner.id, environment, body);
  }

  @Delete(':environment')
  @HttpCode(HttpStatus.NO_CONTENT)
  reset(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('environment', EnvironmentNameSchema) environment: EnvironmentName,
  ): Promise<void> {
    return this.world_layouts.reset(owner.id, environment);
  }
}
