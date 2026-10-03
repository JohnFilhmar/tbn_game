import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdSchema, type AgentAttachments, type Integration, type Plugin } from '@tbn/contracts';
import type { AuthenticatedOwner } from '@/lib/auth/authenticated_owner';
import { CurrentOwner } from '@/lib/auth/current_owner.decorator';
import { ZodParam } from '@/lib/validation/zod.decorator';
import { AgentService } from '@/modules/company/services/agent.service';
import { AgentAttachmentService } from '@/modules/company/services/agent_attachment.service';
import { IntegrationService } from '@/modules/integrations/services/integration.service';
import { PluginService } from '@/modules/integrations/services/plugin.service';

/** Gives an agent an integration as a tool, or a plugin's tools, and takes them away. */
@Controller('agents')
export class AgentAttachmentController {
  constructor(
    private readonly agents: AgentService,
    private readonly attachments: AgentAttachmentService,
    private readonly integrations: IntegrationService,
    private readonly plugins: PluginService,
  ) {}

  @Get(':id/attachments')
  list(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<AgentAttachments> {
    return this.attachments.get(owner.id, id);
  }

  @Post(':id/integrations/:integration_id')
  @HttpCode(HttpStatus.CREATED)
  async attach_integration(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodParam('integration_id', IdSchema) integration_id: string,
  ): Promise<Integration> {
    await this.agents.require(owner.id, id);
    return this.integrations.attach(owner.id, integration_id, id);
  }

  @Delete(':id/integrations/:integration_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach_integration(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodParam('integration_id', IdSchema) integration_id: string,
  ): Promise<void> {
    await this.agents.require(owner.id, id);
    await this.integrations.detach(owner.id, integration_id, id);
  }

  @Post(':id/plugins/:plugin_id')
  @HttpCode(HttpStatus.CREATED)
  async attach_plugin(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodParam('plugin_id', IdSchema) plugin_id: string,
  ): Promise<Plugin> {
    await this.agents.require(owner.id, id);
    return this.plugins.attach(owner.id, plugin_id, id);
  }

  @Delete(':id/plugins/:plugin_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach_plugin(
    @CurrentOwner() owner: AuthenticatedOwner,
    @ZodParam('id', IdSchema) id: string,
    @ZodParam('plugin_id', IdSchema) plugin_id: string,
  ): Promise<void> {
    await this.agents.require(owner.id, id);
    await this.plugins.detach(owner.id, plugin_id, id);
  }
}
