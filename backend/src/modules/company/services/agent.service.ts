import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppearanceSchema,
  ToolPoliciesSchema,
  type Agent,
  type AgentListQuery,
  type RecruitAgent,
  type UpdateAgent,
} from '@tbn/contracts';
import {
  AGENT_REPOSITORY,
  type AgentRepository,
} from '@/modules/company/repositories/interface/agent_repository.interface';
import {
  TASK_REPOSITORY,
  type TaskRepository,
} from '@/modules/company/repositories/interface/task_repository.interface';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { ProviderService } from '@/modules/runtime/services/provider.service';

/** Maps an agent row to the API shape, parsing the JSON columns. */
export function to_agent_view(record: AgentRecord): Agent {
  const appearance = AppearanceSchema.safeParse(record.appearance);
  const tool_policy = ToolPoliciesSchema.safeParse(record.tool_policy);
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    job_description: record.job_description,
    level: record.level === 2 ? 2 : 1,
    department_id: record.department_id,
    provider_id: record.provider_id,
    primary_model: record.primary_model,
    intern_model: record.intern_model,
    appearance: appearance.success ? appearance.data : {},
    tool_policy: tool_policy.success ? tool_policy.data : {},
    status: record.status,
    active_run_id: record.active_run_id,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Level 1 agents, their departments, and the run lock on each agent. */
@Injectable()
export class AgentService {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly providers: ProviderService,
  ) {}

  async list(owner_id: string, query: AgentListQuery): Promise<Agent[]> {
    return (await this.agents.list(owner_id, query)).map(to_agent_view);
  }

  async get(owner_id: string, id: string): Promise<Agent> {
    return to_agent_view(await this.require(owner_id, id));
  }

  /** The row itself, for the runtime. */
  async require(owner_id: string, id: string): Promise<AgentRecord> {
    const record = await this.agents.find(owner_id, id);
    if (record === null) throw new NotFoundException('Agent not found');
    return record;
  }

  /** True when the agent exists for this owner. */
  async exists(owner_id: string, id: string): Promise<boolean> {
    return (await this.agents.find(owner_id, id)) !== null;
  }

  /**
   * Recruits a level 1 agent, which heads a new department named after its role.
   *
   * @throws ConflictException when the name is taken.
   * @throws NotFoundException when the provider does not offer both models.
   */
  async recruit(owner_id: string, input: RecruitAgent): Promise<Agent> {
    if ((await this.agents.find_by_name(owner_id, input.name)) !== null) {
      throw new ConflictException('Agent name is taken');
    }
    await this.require_models(owner_id, input.provider_id, input.primary_model, input.intern_model);
    const record = await this.agents.recruit_manager(owner_id, {
      name: input.name,
      role: input.role,
      job_description: input.job_description,
      provider_id: input.provider_id,
      primary_model: input.primary_model,
      intern_model: input.intern_model,
      appearance: input.appearance ?? {},
      tool_policy: input.tool_policy ?? {},
    });
    return to_agent_view(record);
  }

  /** Edits an agent. Changes take effect on its next model turn. */
  async update(owner_id: string, id: string, input: UpdateAgent): Promise<Agent> {
    const current = await this.require(owner_id, id);
    if (current.status === 'dismissed') throw new ConflictException('Agent is dismissed');
    if (input.name !== undefined && input.name !== current.name) {
      if ((await this.agents.find_by_name(owner_id, input.name)) !== null) {
        throw new ConflictException('Agent name is taken');
      }
    }
    if (
      input.provider_id !== undefined ||
      input.primary_model !== undefined ||
      input.intern_model !== undefined
    ) {
      await this.require_models(
        owner_id,
        input.provider_id ?? current.provider_id,
        input.primary_model ?? current.primary_model,
        input.intern_model ?? current.intern_model,
      );
    }
    const record = await this.agents.update(owner_id, id, input);
    if (record === null) throw new NotFoundException('Agent not found');
    return to_agent_view(record);
  }

  /** Dismisses an agent. Its queued tasks are cancelled and a running task stops at its next turn. */
  async dismiss(owner_id: string, id: string): Promise<Agent> {
    const current = await this.require(owner_id, id);
    if (current.status === 'dismissed') return to_agent_view(current);
    await this.tasks.cancel_queued_for_agent(owner_id, id);
    const record = await this.agents.set_status(owner_id, id, 'dismissed');
    if (record === null) throw new NotFoundException('Agent not found');
    return to_agent_view(record);
  }

  /** Takes the agent for one run. False when it is busy or dismissed. */
  claim_run(owner_id: string, id: string, run_id: string): Promise<boolean> {
    return this.agents.claim_run(owner_id, id, run_id);
  }

  /** Gives the agent back when its run ends. */
  release_run(owner_id: string, id: string, run_id: string): Promise<void> {
    return this.agents.release_run(owner_id, id, run_id);
  }

  private async require_models(
    owner_id: string,
    provider_id: string,
    primary_model: string,
    intern_model: string,
  ): Promise<void> {
    const [has_primary, has_intern] = await Promise.all([
      this.providers.has_model(owner_id, provider_id, primary_model),
      this.providers.has_model(owner_id, provider_id, intern_model),
    ]);
    if (!has_primary || !has_intern) {
      throw new NotFoundException('Provider does not offer both models');
    }
  }
}
