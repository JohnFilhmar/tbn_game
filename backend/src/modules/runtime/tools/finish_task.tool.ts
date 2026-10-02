import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TaskService } from '@/modules/company/services/task.service';
import type { FinishedTask, Tool, ToolContext, ToolOutcome } from './tool.interface';

const SectionSchema = z.string().max(50_000);

/** A manager's report fits on one screen: this many characters across the four fields. */
export const MANAGER_REPORT_CHARS = 2_000;

/**
 * Ends the current task with the report the owner reads. A task with open subtasks cannot end,
 * and a manager's report must fit on one screen.
 */
@Injectable()
export class FinishTaskTool implements Tool<FinishedTask> {
  readonly name = 'finish_task';
  readonly description = `Finish the current task. Call it exactly once, when the work is complete and every subtask has reported, with the report for the owner. Markdown is welcome in every field. A manager's report condenses its interns' reports and fits on one screen: at most ${MANAGER_REPORT_CHARS} characters across the four fields.`;
  readonly default_policy = 'auto';
  readonly input_schema = z.strictObject({
    outcome: SectionSchema.min(1).describe('The result, first and in one or two sentences'),
    what_was_done: SectionSchema.describe('What you did, including files you wrote'),
    decisions: SectionSchema.describe('What you decided and why'),
    open_questions: SectionSchema.describe('What is unresolved or needs the owner'),
  });

  constructor(private readonly tasks: TaskService) {}

  async execute(input: FinishedTask, context: ToolContext): Promise<ToolOutcome> {
    if (context.task_id === null) return { content: 'There is no task to finish', is_error: true };
    const open = await this.tasks.open_children(context.owner_id, context.task_id);
    if (open.length > 0) {
      const titles = open.map((task) => `"${task.title}"`).join(', ');
      return {
        content: `${open.length} of your subtasks are still open: ${titles}. End your turn to wait for their reports, then finish.`,
        is_error: true,
      };
    }
    if (context.agent.level === 1) {
      const length =
        input.outcome.length +
        input.what_was_done.length +
        input.decisions.length +
        input.open_questions.length;
      if (length > MANAGER_REPORT_CHARS) {
        return {
          content: `A manager's report must fit on one screen: at most ${MANAGER_REPORT_CHARS} characters across the four fields, and yours has ${length}. Condense it and call finish_task again.`,
          is_error: true,
        };
      }
    }
    return { content: 'Task finished. The report is saved.', finished: input };
  }
}
