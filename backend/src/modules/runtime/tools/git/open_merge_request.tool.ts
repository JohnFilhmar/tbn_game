import { Injectable, NotFoundException } from '@nestjs/common';
import { IdSchema } from '@tbn/contracts';
import { z } from 'zod';
import { GitRecordsService } from '@/modules/company/services/git_records.service';
import { TaskService } from '@/modules/company/services/task.service';
import { AgentBranchesService } from '@/modules/runtime/services/git/agent_branches.service';
import { BASE_BRANCH } from '@/modules/runtime/services/git/branch_rules';
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

/** How much of a test job's output a merge request keeps. */
const TEST_OUTPUT_CHARS = 20_000;

const InputSchema = z.strictObject({
  repository: RepositoryInputSchema,
  notes: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe('What the branch does and what you reviewed, for the owner'),
  test_job_id: IdSchema.optional().describe(
    'The id of the run_command job that ran the tests on your branch, from its output',
  ),
});

type Input = z.infer<typeof InputSchema>;

/** A manager asks the owner to merge its branch into `development`. */
@Injectable()
export class OpenMergeRequestTool implements Tool<Input> {
  readonly name = 'open_merge_request';
  readonly description =
    'Open a merge request from your <manager>/main branch into development, with the diff, the log, your notes and the output of the test job. Only the owner merges it. Publish your branch first.';
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
      const { manager_branch } = await this.branches.department_of(context.agent);
      const open = await this.records.find_open_merge_request(
        context.owner_id,
        repository.id,
        manager_branch,
      );
      if (open !== null) {
        return {
          content: `Merge request ${open.id} from ${manager_branch} is still open. The owner decides on it first.`,
          is_error: true,
        };
      }
      let test_output: string | null = null;
      if (input.test_job_id !== undefined) {
        try {
          const job = await this.jobs.get(context.owner_id, input.test_job_id);
          test_output =
            `exit code ${job.exit_code ?? 'unknown'}\n${job.stdout}\n${job.stderr}`.slice(
              0,
              TEST_OUTPUT_CHARS,
            );
        } catch (error: unknown) {
          if (error instanceof NotFoundException) {
            return { content: `No sandbox job has the id ${input.test_job_id}.`, is_error: true };
          }
          throw error;
        }
      }
      const worker = worker_of(context);
      const head = await this.git.rev(context.owner_id, repository, manager_branch, worker);
      if (head.outcome !== 'done') return job_error_outcome(head);
      const diff = await this.git.diff(
        context.owner_id,
        repository,
        BASE_BRANCH,
        manager_branch,
        worker,
      );
      if (diff.outcome !== 'done') return job_error_outcome(diff);
      const log = await this.git.log(
        context.owner_id,
        repository,
        BASE_BRANCH,
        manager_branch,
        worker,
      );
      if (log.outcome !== 'done') return job_error_outcome(log);
      if (log.stdout.length === 0) {
        return {
          content: `${manager_branch} has no commits that ${BASE_BRANCH} lacks. Publish your work first.`,
          is_error: true,
        };
      }
      const request = await this.records.open_merge_request(context.owner_id, {
        repository_id: repository.id,
        agent_id: context.agent_id,
        source_branch: manager_branch,
        target_branch: BASE_BRANCH,
        head_sha: head.stdout,
        diff: diff.stdout,
        log: log.stdout,
        review_notes: input.notes,
        test_output,
        test_job_id: input.test_job_id ?? null,
      });
      return {
        content: `Opened merge request ${request.id} from ${manager_branch} into ${BASE_BRANCH} at ${head.stdout}. The owner decides on it; your task can finish.`,
      };
    } catch (error: unknown) {
      return rule_error_outcome(error);
    }
  }
}
