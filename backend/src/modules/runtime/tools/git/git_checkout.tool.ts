import { Injectable } from '@nestjs/common';
import { BranchNameSchema } from '@tbn/contracts';
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

/** The branch new work starts from. */
const BASE_BRANCH = 'development';

const InputSchema = z.strictObject({
  repository: RepositoryInputSchema,
  branch: BranchNameSchema.optional().describe(
    'Managers only: a feature branch of your department to look at instead of your own branch.',
  ),
});

type Input = z.infer<typeof InputSchema>;

/** Prepares the agent's checkout of a repository on its branch. */
@Injectable()
export class GitCheckoutTool implements Tool<Input> {
  readonly name = 'git_checkout';
  readonly description =
    'Prepare your checkout of a repository on your branch: an intern gets the feature branch of its task, created from development; a manager gets its own <manager>/main branch, or a feature branch of its department to review. The checkout appears in your sandbox under the repository name; use run_command with that cwd to build, test and commit there.';
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
      const branch = await this.branches.working_branch(context.agent, task, input.branch);
      const result = await this.git.checkout(
        context.owner_id,
        repository,
        worker_of(context),
        branch,
        BASE_BRANCH,
      );
      if (result.outcome !== 'done') return job_error_outcome(result);
      return {
        content: `Checked out ${branch} of ${repository.name} at ${result.stdout}. It is at ${repository.name}/ in your sandbox: run commands in it with run_command and cwd "${repository.name}".`,
      };
    } catch (error: unknown) {
      return rule_error_outcome(error);
    }
  }
}
