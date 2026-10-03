import { Injectable } from '@nestjs/common';
import type { AgentAttachments } from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import { IntegrationService } from '@/modules/integrations/services/integration.service';
import { PluginService } from '@/modules/integrations/services/plugin.service';

/** What an agent has attached: the integrations it calls and the plugins whose tools it sees. */
@Injectable()
export class AgentAttachmentService {
  constructor(
    private readonly agents: AgentService,
    private readonly integrations: IntegrationService,
    private readonly plugins: PluginService,
  ) {}

  /**
   * The attachments of an agent.
   *
   * @throws NotFoundException when the agent is missing.
   */
  async get(owner_id: string, agent_id: string): Promise<AgentAttachments> {
    await this.agents.require(owner_id, agent_id);
    const [integration_ids, plugin_ids] = await Promise.all([
      this.integrations.attached_ids(owner_id, agent_id),
      this.plugins.attached_ids(owner_id, agent_id),
    ]);
    return { agent_id, integration_ids, plugin_ids };
  }
}
