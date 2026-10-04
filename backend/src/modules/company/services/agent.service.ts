import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppearanceSchema,
  ToolPoliciesSchema,
  type AgentStatus,
  type Agent,
  type AgentListQuery,
  type RecruitAgent,
  type UpdateAgent,
} from '@tbn/contracts';
import {
  AGENT_REPOSITORY,
  type AgentRepository,
  type LiveAgentFilter,
} from '@/modules/company/repositories/interface/agent_repository.interface';
import {
  DEPARTMENT_REPOSITORY,
  type DepartmentRepository,
} from '@/modules/company/repositories/interface/department_repository.interface';
import {
  TASK_REPOSITORY,
  type TaskRepository,
} from '@/modules/company/repositories/interface/task_repository.interface';
import type {
  AgentRecord,
  IdleInternRecord,
  InternSpec,
  RosterEntry,
  TaskRecord,
} from '@/modules/company/types/company_records';
import { ProviderService } from '@/modules/runtime/services/provider.service';

const INTERN_LEVEL = 2;

/** Statuses a task can hold an agent in. */
const HELD_STATUSES = new Set(['in_progress', 'blocked', 'awaiting_approval']);

/** True when an agent can take work: neither dismissed nor terminated. */
export function is_live(status: AgentStatus): boolean {
  return status !== 'dismissed' && status !== 'terminated';
}

/** Maps an agent row to the API shape, parsing the JSON columns. */
export function to_agent_view(record: AgentRecord): Agent {
  const appearance = AppearanceSchema.safeParse(record.appearance);
  const tool_policy = ToolPoliciesSchema.safeParse(record.tool_policy);
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    job_description: record.job_description,
    level: record.level === INTERN_LEVEL ? INTERN_LEVEL : 1,
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

/** Managers and their interns, their departments, the roster, and the run lock on each agent. */
@Injectable()
export class AgentService {
  constructor(
    @Inject(AGENT_REPOSITORY) private readonly agents: AgentRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(DEPARTMENT_REPOSITORY) private readonly departments: DepartmentRepository,
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

  /** The agent with this name, or null. */
  find_by_name(owner_id: string, name: string): Promise<AgentRecord | null> {
    return this.agents.find_by_name(owner_id, name);
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

  /**
   * Spawns an intern in the manager's department, with the manager's tool policy.
   *
   * @throws ConflictException when `manager` is not a live manager.
   * @throws NotFoundException when the provider does not offer the model.
   */
  async spawn_intern(
    owner_id: string,
    manager: AgentRecord,
    spec: InternSpec,
  ): Promise<AgentRecord> {
    if (manager.level !== 1 || !is_live(manager.status)) {
      throw new ConflictException('Only a live manager can spawn interns');
    }
    if (!(await this.providers.has_model(owner_id, spec.provider_id, spec.primary_model))) {
      throw new NotFoundException('Provider does not offer the model');
    }
    const policies = ToolPoliciesSchema.safeParse(manager.tool_policy);
    return this.agents.spawn_intern(owner_id, manager.name, {
      role: spec.role,
      job_description: spec.job_description,
      department_id: manager.department_id,
      provider_id: spec.provider_id,
      primary_model: spec.primary_model,
      tool_policy: policies.success ? policies.data : {},
    });
  }

  /** Interns of a department with no active run and no open task, oldest first. */
  idle_interns(owner_id: string, department_id: string): Promise<AgentRecord[]> {
    return this.agents.idle_interns(owner_id, department_id);
  }

  /** How many agents are neither dismissed nor terminated. */
  count_live(owner_id: string, filter: LiveAgentFilter): Promise<number> {
    return this.agents.count_live(owner_id, filter);
  }

  /** Live agents on a provider, for blocking every task on a key that ran out of credit. */
  list_on_provider(owner_id: string, provider_id: string): Promise<AgentRecord[]> {
    return this.agents.list_on_provider(owner_id, provider_id);
  }

  /** Every live agent with its department and the task it holds, oldest agent first. */
  async roster(owner_id: string): Promise<RosterEntry[]> {
    const [agents, open] = await Promise.all([
      this.agents.list_live(owner_id),
      this.tasks.list_open(owner_id),
    ]);
    const by_agent = new Map<string, TaskRecord[]>();
    for (const task of open) {
      const list = by_agent.get(task.assignee_agent_id) ?? [];
      list.push(task);
      by_agent.set(task.assignee_agent_id, list);
    }
    return agents.map(({ agent, department_name }) => {
      const tasks = by_agent.get(agent.id) ?? [];
      return {
        agent,
        department_name,
        current_task: tasks.find((task) => HELD_STATUSES.has(task.status)) ?? null,
        queued_task_count: tasks.filter((task) => task.status === 'queued').length,
      };
    });
  }

  /**
   * Terminates an idle intern with no open task, idle since before `idle_before` when given.
   * Returns false when it is not idle or not an intern.
   */
  terminate_idle_intern(owner_id: string, id: string, idle_before: Date | null): Promise<boolean> {
    return this.agents.terminate_idle_intern(owner_id, id, idle_before);
  }

  /** Idle interns of every owner, for the worker's sweep. */
  find_idle_interns(): Promise<IdleInternRecord[]> {
    return this.agents.find_idle_interns();
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

  /**
   * Brings a dismissed or ended agent back to work, idle in its department as before. An intern
   * comes back only under a live manager. A live agent is answered as it is.
   *
   * @throws ConflictException when an intern's manager is not live.
   */
  async rehire(owner_id: string, id: string): Promise<Agent> {
    const current = await this.require(owner_id, id);
    if (is_live(current.status)) return to_agent_view(current);
    if (current.level === INTERN_LEVEL) {
      const department = await this.departments.find(owner_id, current.department_id);
      const manager =
        department?.manager_agent_id == null
          ? null
          : await this.agents.find(owner_id, department.manager_agent_id);
      if (manager === null || !is_live(manager.status)) {
        throw new ConflictException('Rehire their manager first');
      }
    }
    const record = await this.agents.set_status(owner_id, id, 'idle');
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
