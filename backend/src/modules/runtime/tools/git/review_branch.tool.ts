import { Injectable, NotFoundException } from '@nestjs/common';
import { BranchNameSchema, IdSchema, ReviewVerdictSchema } from '@tbn/contracts';
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
  branch: BranchNameSchema.describe('The feature branch of your department you reviewed'),
  findings: z.string().trim().min(1).max(20_000).describe('What you found, for the record'),
  verdict: ReviewVerdictSchema,
  test_job_id: IdSchema.optional().describe(
    'The id of the run_command job that ran the tests on this branch, from its output',
  ),
});

type Input = z.infer<typeof InputSchema>;

/** A manager records its review of an intern's branch at the commit it reviewed. */
@Injectable()
export class ReviewBranchTool implements Tool<Input> {
  readonly name = 'review_branch';
  readonly description =
    'Record your review of a feature branch of your department at its current commit: your findings, approve or request_changes, and the run_command job that ran its tests. A branch merges into your branch only with an approving review of its current commit whose test job passed.';
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
      const { manager } = await this.branches.department_of(context.agent);
      if (!is_department_feature_branch(input.branch, manager.name)) {
        return {
          content: `${input.branch} is not a feature branch of your department.`,
          is_error: true,
        };
      }
      if (input.test_job_id !== undefined) {
        try {
          await this.jobs.get(context.owner_id, input.test_job_id);
        } catch (error: unknown) {
          if (error instanceof NotFoundException) {
            return { content: `No sandbox job has the id ${input.test_job_id}.`, is_error: true };
          }
          throw error;
        }
      }
      const head = await this.git.rev(
        context.owner_id,
        repository,
        input.branch,
        worker_of(context),
      );
      if (head.outcome !== 'done') return job_error_outcome(head);
      const review = await this.records.record_review(context.owner_id, {
        repository_id: repository.id,
        reviewer_agent_id: context.agent_id,
        branch: input.branch,
        head_sha: head.stdout,
        findings: input.findings,
        verdict: input.verdict,
        test_job_id: input.test_job_id ?? null,
      });
      return {
        content: `Recorded review ${review.id} of ${input.branch} at ${head.stdout}: ${input.verdict}.`,
      };
    } catch (error: unknown) {
      return rule_error_outcome(error);
    }
  }
}
