import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  CreatePluginSchema,
  IdSchema,
  UpdatePluginSchema,
  type CreatePlugin,
  type Plugin,
  type PluginTool,
  type UpdatePlugin,
} from '@tbn/contracts';
import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodBody, ZodParam } from '@/lib/validation/zod.decorator';
import { PluginError, PluginService } from '@/modules/integrations/services/plugin.service';
import { OwnerOnly } from '@/lib/auth/guest_policy.decorator';

/** MCP plugins. Tokens are written here and never read back. */
@OwnerOnly()
@Controller('plugins')
export class PluginController {
  constructor(private readonly plugins: PluginService) {}

  @Get()
  list(@CurrentOwner() owner: AuthenticatedOwner): Promise<Plugin[]> {
    return this.plugins.list(owner.id);
  }

  @Post()
  create(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodBody(CreatePluginSchema) body: CreatePlugin,
  ): Promise<Plugin> {
    return this.plugins.create(owner.id, body);
  }

  @Get(':id')
  get(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Plugin> {
    return this.plugins.get(owner.id, id);
  }

  @Patch(':id')
  update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodBody(UpdatePluginSchema) body: UpdatePlugin,
  ): Promise<Plugin> {
    return this.plugins.update(owner.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<void> {
    return this.plugins.delete(owner.id, id);
  }

  /** Lists the tools the plugin offers right now. */
  @Post(':id/tools')
  @HttpCode(HttpStatus.OK)
  async tools(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<PluginTool[]> {
    const record = await this.plugins.require(owner.id, id);
    try {
      return await this.plugins.list_tools(record);
    } catch (error: unknown) {
      if (error instanceof PluginError) {
        throw new ServiceUnavailableException(`The plugin did not answer: ${error.message}`);
      }
      throw error;
    }
  }
}
