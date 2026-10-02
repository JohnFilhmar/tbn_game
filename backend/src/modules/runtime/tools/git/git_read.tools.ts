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

const InputSchema = z.strictObject({
  repository: RepositoryInputSchema,
  base: BranchNameSchema.optional().describe('The branch to compare against. Default development.'),
  head: BranchNameSchema.optional().describe('The branch to look at. Default your own branch.'),
});

type Input = z.infer<typeof InputSchema>;

/** What `git_diff` and `git_log` share: resolving the two branches and running the read. */
@Injectable()
export class GitReadSupport {
  constructor(
    private readonly tasks: TaskService,
    private readonly records: GitRecordsService,
    private readonly branches: AgentBranchesService,
    private readonly git: GitJobService,
  ) {}

  async read(input: Input, context: ToolContext, operation: 'diff' | 'log'): Promise<ToolOutcome> {
    try {
      const { task, repository } = await resolve_target(
        context,
        input.repository,
        this.tasks,
        this.records,
      );
      const head =
        input.head ?? (await this.branches.working_branch(context.agent, task, undefined));
      const base = input.base ?? 'development';
      const result =
        operation === 'diff'
          ? await this.git.diff(context.owner_id, repository, base, head, worker_of(context))
          : await this.git.log(context.owner_id, repository, base, head, worker_of(context));
      if (result.outcome !== 'done') return job_error_outcome(result);
      const body = result.stdout.length > 0 ? result.stdout : '(no difference)';
      return { content: `${operation} of ${head} against ${base} in ${repository.name}:\n${body}` };
    } catch (error: unknown) {
      return rule_error_outcome(error);
    }
  }
}

/** The change a branch makes on another, from the canonical repository. */
@Injectable()
export class GitDiffTool implements Tool<Input> {
  readonly name = 'git_diff';
  readonly description =
    'The diff of a published branch against another in the company repository, by default your branch against development. Reads the company repository, not your checkout: publish first to see your latest commits.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(private readonly support: GitReadSupport) {}

  execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    return this.support.read(input, context, 'diff');
  }
}

/** The commits a branch adds to another, from the canonical repository. */
@Injectable()
export class GitLogTool implements Tool<Input> {
  readonly name = 'git_log';
  readonly description =
    'The commits a published branch adds to another in the company repository, by default your branch against development.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(private readonly support: GitReadSupport) {}

  execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    return this.support.read(input, context, 'log');
  }
}
