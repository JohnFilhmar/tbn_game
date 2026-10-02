import { NotFoundException } from '@nestjs/common';
import type { Task } from '@tbn/contracts';
import { z } from 'zod';
import type { GitRecordsService } from '@/modules/company/services/git_records.service';
import type { TaskService } from '@/modules/company/services/task.service';
import type { RepositoryRecord } from '@/modules/company/types/git_records';
import { BranchRuleError } from '@/modules/runtime/services/git/agent_branches.service';
import type { GitJobAgent, GitJobResult } from '@/modules/runtime/services/git/git_job.service';
import type { ToolContext, ToolOutcome } from '../tool.interface';

/** The optional repository name every git tool takes; the task's repository when left out. */
export const RepositoryInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .describe('The repository name. Left out, the repository of your task.');

/** The agent and run a git job works for. */
export function worker_of(context: ToolContext): GitJobAgent {
  return { origin: { run_id: context.run_id, agent: context.agent }, agent: context.agent };
}

/** What a git tool needs to start: the task, when there is one, and the repository. */
export interface GitToolTarget {
  task: Task | null;
  repository: RepositoryRecord;
}

/** Raised when the tool cannot tell which repository is meant. */
export class NoRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoRepositoryError';
  }
}

/**
 * Resolves the repository a tool call is about: the one named, else the task's.
 *
 * @throws NoRepositoryError when neither names one.
 */
export async function resolve_target(
  context: ToolContext,
  name: string | undefined,
  tasks: TaskService,
  records: GitRecordsService,
): Promise<GitToolTarget> {
  const task = context.task_id === null ? null : await tasks.get(context.owner_id, context.task_id);
  if (name !== undefined) {
    const repository = await records.find_repository_by_name(context.owner_id, name);
    if (repository === null) throw new NoRepositoryError(`No repository is named ${name}.`);
    return { task, repository };
  }
  if (task?.repository_id === null || task?.repository_id === undefined) {
    throw new NoRepositoryError(
      'Your task names no repository. Name one, or ask the owner to assign the task a repository.',
    );
  }
  try {
    return {
      task,
      repository: await records.require_repository(context.owner_id, task.repository_id),
    };
  } catch (error: unknown) {
    if (error instanceof NotFoundException) {
      throw new NoRepositoryError('The repository of your task no longer exists.');
    }
    throw error;
  }
}

/** Turns a rule or lookup problem into the tool's answer, and rethrows anything else. */
export function rule_error_outcome(error: unknown): ToolOutcome {
  if (error instanceof BranchRuleError || error instanceof NoRepositoryError) {
    return { content: error.message, is_error: true };
  }
  throw error;
}

/** The tool's answer for a job that did not end well. */
export function job_error_outcome(result: Exclude<GitJobResult, { outcome: 'done' }>): ToolOutcome {
  const prefix =
    result.outcome === 'refused'
      ? 'Refused'
      : result.outcome === 'conflict'
        ? 'Merge conflict'
        : 'The git job failed';
  return { content: `${prefix}: ${result.message}`, is_error: true };
}
