import { Injectable, Logger } from '@nestjs/common';
import type { Preferences } from '@tbn/contracts';
import { z } from 'zod';
import { AgentService, is_live } from '@/modules/company/services/agent.service';
import { TaskService } from '@/modules/company/services/task.service';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import { CapService, type ThresholdDefaults } from '@/modules/runtime/services/caps/cap.service';
import { threshold_defaults } from '@/modules/runtime/services/caps/cap_window.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

const InputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).describe('A short title for the subtask'),
  instructions: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe('What the intern must do and what it must deliver'),
  intern_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('An idle intern of your own department to reuse, by name'),
  new_intern_role: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('The role of a new intern, when no idle intern of your department fits'),
  new_intern_job_description: z
    .string()
    .trim()
    .min(1)
    .max(5_000)
    .optional()
    .describe('What the new intern is for'),
});

type Input = z.infer<typeof InputSchema>;

/** The intern a subtask goes to and how it was chosen. */
type Choice = { intern: AgentRecord; how: string } | { refusal: string };

/** Where a new intern runs. */
type Placement = { provider_id: string; model_id: string; local: boolean } | { refusal: string };

/**
 * Hands a subtask to an intern of the manager's own department: one it names, an idle one of the
 * same role, or a new one. A key past an enforced cap threshold takes no new intern work; new
 * interns then go to the local provider, and without one the manager does the subtask itself.
 */
@Injectable()
export class DelegateTaskTool implements Tool<Input> {
  readonly name = 'delegate_task';
  readonly description =
    'Hand a subtask to an intern of your department. Read list_roster first and reuse an idle intern whose role fits by passing intern_name; otherwise describe a new one with new_intern_role and new_intern_job_description, and an idle intern of that role is reused if there is one. The subtask report reaches you when it finishes: end your turn to wait for it.';
  readonly default_policy = 'auto';
  readonly levels = [1] as const;
  readonly input_schema = InputSchema;
  private readonly logger = new Logger(DelegateTaskTool.name);

  constructor(
    private readonly agents: AgentService,
    private readonly tasks: TaskService,
    private readonly providers: ProviderService,
    private readonly caps: CapService,
    private readonly preferences: PreferenceService,
  ) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    const manager = context.agent;
    if (manager.level !== 1) return { content: 'Only managers delegate.', is_error: true };
    const by_name = input.intern_name !== undefined;
    const by_spec =
      input.new_intern_role !== undefined || input.new_intern_job_description !== undefined;
    if (by_name === by_spec) {
      return {
        content:
          'Give either intern_name, to reuse an idle intern of your department, or new_intern_role and new_intern_job_description for a new one.',
        is_error: true,
      };
    }
    const preferences = await this.preferences.get(context.owner_id);
    const defaults = threshold_defaults(preferences);
    let choice: Choice;
    if (input.intern_name !== undefined) {
      choice = await this.reuse_named(manager, input.intern_name, defaults);
    } else if (
      input.new_intern_role !== undefined &&
      input.new_intern_job_description !== undefined
    ) {
      choice = await this.reuse_or_spawn(
        manager,
        input.new_intern_role,
        input.new_intern_job_description,
        preferences,
        defaults,
      );
    } else {
      choice = {
        refusal: 'A new intern needs both new_intern_role and new_intern_job_description.',
      };
    }
    if ('refusal' in choice) return { content: choice.refusal, is_error: true };

    const task = await this.tasks.delegate(context.owner_id, {
      title: input.title,
      instructions: input.instructions,
      assignee_agent_id: choice.intern.id,
      delegator_agent_id: manager.id,
      parent_task_id: context.task_id,
    });
    const provider = await this.providers.require(context.owner_id, choice.intern.provider_id);
    return {
      content: `Delegated task ${task.id}, "${task.title}", to ${choice.intern.name}: ${choice.how}, on ${provider.name} with ${choice.intern.primary_model}. Its report reaches you when it finishes: end your turn to wait for it.`,
    };
  }

  private async reuse_named(
    manager: AgentRecord,
    name: string,
    defaults: ThresholdDefaults,
  ): Promise<Choice> {
    const owner_id = manager.owner_id;
    const intern = await this.agents.find_by_name(owner_id, name);
    if (intern === null || intern.level !== 2) return { refusal: `No intern is named ${name}.` };
    if (intern.department_id !== manager.department_id) {
      return {
        refusal: `${name} belongs to another department. Managers use only their own interns: send a message to that department's manager instead.`,
      };
    }
    if (!is_live(intern.status)) {
      return { refusal: `${name} was ${intern.status}. Spawn a new intern instead.` };
    }
    const idle = await this.agents.idle_interns(owner_id, manager.department_id);
    if (!idle.some((agent) => agent.id === intern.id)) {
      return {
        refusal: `${name} is busy. Pick an idle intern from list_roster or spawn a new one.`,
      };
    }
    const past = await this.caps.past_threshold(
      owner_id,
      intern.provider_id,
      intern.primary_model,
      defaults,
    );
    if (past.length > 0) {
      return {
        refusal: `${name} runs on a key past the threshold of its cap window ${past.map((window) => window.name).join(', ')}. Spawn a new intern, which runs on the local provider when there is one, or do the subtask yourself.`,
      };
    }
    return { intern, how: 'an idle intern you named' };
  }

  private async reuse_or_spawn(
    manager: AgentRecord,
    role: string,
    job_description: string,
    preferences: Preferences,
    defaults: ThresholdDefaults,
  ): Promise<Choice> {
    const owner_id = manager.owner_id;
    const wanted = role.trim().toLowerCase();
    for (const candidate of await this.agents.idle_interns(owner_id, manager.department_id)) {
      if (candidate.role.trim().toLowerCase() !== wanted) continue;
      const past = await this.caps.past_threshold(
        owner_id,
        candidate.provider_id,
        candidate.primary_model,
        defaults,
      );
      if (past.length === 0) {
        return {
          intern: candidate,
          how: 'an idle intern of that role, reused instead of spawning',
        };
      }
    }
    const limit = await this.limit_reached(manager, preferences);
    if (limit !== null) return { refusal: limit };
    const placement = await this.placement(manager, defaults);
    if ('refusal' in placement) return placement;
    const intern = await this.agents.spawn_intern(owner_id, manager, {
      role,
      job_description,
      provider_id: placement.provider_id,
      primary_model: placement.model_id,
    });
    if (placement.local) {
      this.logger.log(
        `${manager.name} spawned ${intern.name} on the local provider: its key passed a cap threshold`,
      );
    }
    return {
      intern,
      how: placement.local
        ? 'a new intern on the local provider, because your key passed its cap threshold'
        : 'a new intern',
    };
  }

  private async limit_reached(
    manager: AgentRecord,
    preferences: Preferences,
  ): Promise<string | null> {
    const owner_id = manager.owner_id;
    if (preferences.max_interns_per_manager !== null) {
      const live = await this.agents.count_live(owner_id, {
        department_id: manager.department_id,
        level: 2,
      });
      if (live >= preferences.max_interns_per_manager) {
        return `You have ${live} interns, the owner's limit. Reuse an idle one or do the subtask yourself.`;
      }
    }
    if (preferences.max_live_agents !== null) {
      const live = await this.agents.count_live(owner_id, {});
      if (live >= preferences.max_live_agents) {
        return `The company has ${live} live agents, the owner's limit. Reuse an idle intern or do the subtask yourself.`;
      }
    }
    return null;
  }

  private async placement(manager: AgentRecord, defaults: ThresholdDefaults): Promise<Placement> {
    const owner_id = manager.owner_id;
    const past = await this.caps.past_threshold(
      owner_id,
      manager.provider_id,
      manager.intern_model,
      defaults,
    );
    if (past.length === 0) {
      return { provider_id: manager.provider_id, model_id: manager.intern_model, local: false };
    }
    const windows = past.map((window) => window.name).join(', ');
    const local = await this.providers.find_local(owner_id);
    if (local === null || local.id === manager.provider_id) {
      return {
        refusal: `Your key passed the threshold of its cap window ${windows} and there is no local provider. Do this subtask yourself.`,
      };
    }
    const model =
      local.models.find((candidate) => candidate.cost_tier === 'cheap') ?? local.models[0];
    if (model === undefined) {
      return { refusal: 'The local provider has no model. Do this subtask yourself.' };
    }
    const local_past = await this.caps.past_threshold(owner_id, local.id, model.model_id, defaults);
    if (local_past.length > 0) {
      return {
        refusal: `Your key passed the threshold of ${windows}, and the local provider passed its own. Do this subtask yourself.`,
      };
    }
    return { provider_id: local.id, model_id: model.model_id, local: true };
  }
}
