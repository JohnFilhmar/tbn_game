import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentService } from '@/modules/company/services/agent.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

const InputSchema = z.strictObject({});

type Input = z.infer<typeof InputSchema>;

/** Every live agent with what it does and what it holds, so an agent knows its colleagues. */
@Injectable()
export class ListRosterTool implements Tool<Input> {
  readonly name = 'list_roster';
  readonly description =
    'List every agent in the company: name, level, department, role, job description, status, the task it holds, and the key it runs on. Read it before you delegate, to reuse an idle intern of your own department whose role fits the subtask.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(
    private readonly agents: AgentService,
    private readonly providers: ProviderService,
  ) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    const [roster, providers] = await Promise.all([
      this.agents.roster(context.owner_id),
      this.providers.list(context.owner_id),
    ]);
    const by_id = new Map(providers.map((provider) => [provider.id, provider]));
    const agents = roster.map((entry) => {
      const provider = by_id.get(entry.agent.provider_id);
      return {
        name: entry.agent.name,
        level: entry.agent.level === 1 ? 'manager' : 'intern',
        department: entry.department_name,
        your_department: entry.agent.department_id === context.agent.department_id,
        role: entry.agent.role,
        job_description: entry.agent.job_description,
        status: entry.agent.status,
        current_task:
          entry.current_task === null
            ? null
            : { title: entry.current_task.title, status: entry.current_task.status },
        queued_tasks: entry.queued_task_count,
        key: provider?.name ?? null,
        local: provider?.is_local ?? false,
      };
    });
    return { content: JSON.stringify({ you: context.agent.name, agents }, null, 1) };
  }
}
