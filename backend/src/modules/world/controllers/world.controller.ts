import { Controller, Delete, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import {
  EnvironmentNameSchema,
  IdSchema,
  SaveWorldLayoutSchema,
  SaveWorldPropStateSchema,
  type EnvironmentName,
  type SaveWorldLayout,
  type SaveWorldPropState,
  type WorldLayout,
  type WorldLayoutResponse,
  type WorldPropState,
  type WorldPropStatesResponse,
} from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { WorldLayoutService } from '@/modules/world/services/world_layout.service';
import { WorldPropStateService } from '@/modules/world/services/world_prop_state.service';

/** Each environment as the owner arranged and painted it, and the state of its props. */
@Controller('world')
export class WorldController {
  constructor(
    private readonly world_layouts: WorldLayoutService,
    private readonly prop_states: WorldPropStateService,
  ) {}

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

  @Get(':environment/props')
  async props(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('environment', EnvironmentNameSchema) environment: EnvironmentName,
  ): Promise<WorldPropStatesResponse> {
    return { states: await this.prop_states.list(owner.id, environment) };
  }

  @Put(':environment/props/:placement_id')
  save_prop(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('environment', EnvironmentNameSchema) environment: EnvironmentName,
    @ZodParam('placement_id', IdSchema) placement_id: string,
    @ZodBody(SaveWorldPropStateSchema) body: SaveWorldPropState,
  ): Promise<WorldPropState> {
    return this.prop_states.save(owner.id, environment, placement_id, body);
  }
}
