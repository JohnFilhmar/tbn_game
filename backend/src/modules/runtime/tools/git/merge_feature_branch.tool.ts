import { Injectable } from '@nestjs/common';
import { BranchNameSchema } from '@tbn/contracts';
import { z } from 'zod';
import { GitRecordsService } from '@/modules/company/services/git_records.service';
import { TaskService } from '@/modules/company/services/task.service';
import { AgentBranchesService } from '@/modules/runtime/services/git/agent_branches.service';
import { is_department_feature_branch } from '@/modules/runtime/services/git/branch_rules';
import { GitJobService } from '@/modules/runtime/services/git/git_job.service';
import { SandboxJobService } from '@/modules/runtime/services/sandbox/sandbox_job.service';
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
  branch: BranchNameSchema.describe('The reviewed feature branch to merge into your branch'),
});

type Input = z.infer<typeof InputSchema>;

/** A manager merges a reviewed, tested feature branch into its manager branch. */
@Injectable()
export class MergeFeatureBranchTool implements Tool<Input> {
  readonly name = 'merge_feature_branch';
  readonly description =
    'Merge a feature branch of your department into your <manager>/main branch. It needs an approving review_branch of its current commit whose test job exited 0. Check out your branch again afterwards to see the merge in your sandbox.';
  readonly default_policy = 'auto';
  readonly levels = [1] as const;
  readonly input_schema = InputSchema;

  constructor(
    private readonly tasks: TaskService,
    private readonly records: GitRecordsService,
    private readonly branches: AgentBranchesService,
    private readonly git: GitJobService,
    private readonly jobs: SandboxJobService,
  ) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    try {
      const { repository } = await resolve_target(
        context,
        input.repository,
        this.tasks,
        this.records,
      );
      const { manager, manager_branch } = await this.branches.department_of(context.agent);
      if (!is_department_feature_branch(input.branch, manager.name)) {
        return {
          content: `${input.branch} is not a feature branch of your department.`,
          is_error: true,
        };
      }
      const head = await this.git.rev(
        context.owner_id,
        repository,
        input.branch,
        worker_of(context),
      );
      if (head.outcome !== 'done') return job_error_outcome(head);
      const review = await this.records.latest_review(
        context.owner_id,
        repository.id,
        input.branch,
      );
      if (review === null || review.verdict !== 'approve') {
        return {
          content: `${input.branch} has no approving review. Review it first.`,
          is_error: true,
        };
      }
      if (review.head_sha !== head.stdout) {
        return {
          content: `${input.branch} moved to ${head.stdout} since its review of ${review.head_sha}. Review the current commit.`,
          is_error: true,
        };
      }
      if (review.test_job_id === null) {
        return {
          content:
            'The review names no test job. Run the tests with run_command and review again with its job id.',
          is_error: true,
        };
      }
      const test = await this.jobs.get(context.owner_id, review.test_job_id);
      if (test.exit_code !== 0) {
        return {
          content: `The test job ${test.id} of the review did not pass: exit code ${test.exit_code ?? 'unknown'}.`,
          is_error: true,
        };
      }
      const merged = await this.git.merge_feature(
        context.owner_id,
        repository,
        worker_of(context),
        input.branch,
        manager_branch,
        review.head_sha,
      );
      if (merged.outcome !== 'done') return job_error_outcome(merged);
      return {
        content: `Merged ${input.branch} into ${manager_branch} as ${merged.stdout}. Check out ${manager_branch} again to see it in your sandbox.`,
      };
    } catch (error: unknown) {
      return rule_error_outcome(error);
    }
  }
}
