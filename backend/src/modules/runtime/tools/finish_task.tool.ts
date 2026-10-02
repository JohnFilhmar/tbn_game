import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { FinishedTask, Tool, ToolContext, ToolOutcome } from './tool.interface';

const SectionSchema = z.string().max(50_000);

/** Ends the current task with the report the owner reads. */
@Injectable()
export class FinishTaskTool implements Tool<FinishedTask> {
  readonly name = 'finish_task';
  readonly description =
    'Finish the current task. Call it exactly once, when the work is complete, with the report for the owner. Markdown is welcome in every field.';
  readonly default_policy = 'auto';
  readonly input_schema = z.strictObject({
    outcome: SectionSchema.min(1).describe('The result, first and in one or two sentences'),
    what_was_done: SectionSchema.describe('What you did, including files you wrote'),
    decisions: SectionSchema.describe('What you decided and why'),
    open_questions: SectionSchema.describe('What is unresolved or needs the owner'),
  });

  execute(input: FinishedTask, context: ToolContext): Promise<ToolOutcome> {
    if (context.task_id === null) {
      return Promise.resolve({ content: 'There is no task to finish', is_error: true });
    }
    return Promise.resolve({ content: 'Task finished. The report is saved.', finished: input });
  }
}
