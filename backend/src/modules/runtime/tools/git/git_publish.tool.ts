import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GitRecordsService } from '@/modules/company/services/git_records.service';
import { TaskService } from '@/modules/company/services/task.service';
import { AgentBranchesService } from '@/modules/runtime/services/git/agent_branches.service';
import { GitJobService } from '@/modules/runtime/services/git/git_job.service';
import type { Tool, ToolContext, ToolOutcome } from '../tool.interface';
import {
  RepositoryInputSchema,
  job_error_outcome,
  resolve_target,
  rule_error_outcome,
  worker_of,
} from './git_tool_support';

const InputSchema = z.strictObject({ repository: RepositoryInputSchema });

type Input = z.infer<typeof InputSchema>;

/** Sends the agent's branch from its checkout to the canonical repository. */
@Injectable()
export class GitPublishTool implements Tool<Input> {
  readonly name = 'git_publish';
  readonly description =
    'Publish the commits on your branch from your checkout to the company repository, fast-forward only. An intern publishes the feature branch of its task; a manager publishes its <manager>/main branch. Nobody writes development, staging or the default branch: the owner merges those from a merge request.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(
    private readonly tasks: TaskService,
    private readonly records: GitRecordsService,
    private readonly branches: AgentBranchesService,
    private readonly git: GitJobService,
  ) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    try {
      const { task, repository } = await resolve_target(
        context,
        input.repository,
        this.tasks,
        this.records,
      );
      const branch = await this.branches.working_branch(context.agent, task, undefined);
      const allowed = await this.branches.publishable(context.agent, repository.id);
      const result = await this.git.publish(
        context.owner_id,
        repository,
        worker_of(context),
        branch,
        allowed,
      );
      if (result.outcome !== 'done') return job_error_outcome(result);
      return { content: `Published ${branch} of ${repository.name} at ${result.stdout}.` };
    } catch (error: unknown) {
      return rule_error_outcome(error);
    }
  }
}
