import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TaskService } from '@/modules/company/services/task.service';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

const DeclineInputSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .describe('Why you cannot do it, and who could, in a sentence or two'),
});

type DeclineInput = z.infer<typeof DeclineInputSchema>;

/**
 * Turns the current task down, so an agent whose job description rules a task out says so instead
 * of attempting it or reporting it done. The task ends as `declined` with the reason as its result.
 */
@Injectable()
export class DeclineTaskTool implements Tool<DeclineInput> {
  readonly name = 'decline_task';
  readonly description =
    'Decline the current task when it is outside your job description or you cannot do it. The task ends as declined with your reason, and nothing is reported as done. Use it instead of finish_task, never after it.';
  readonly default_policy = 'auto';
  readonly input_schema = DeclineInputSchema;

  constructor(private readonly tasks: TaskService) {}

  async execute(input: DeclineInput, context: ToolContext): Promise<ToolOutcome> {
    if (context.task_id === null) return { content: 'There is no task to decline', is_error: true };
    const open = await this.tasks.open_children(context.owner_id, context.task_id);
    if (open.length > 0) {
      return {
        content: `${open.length} of your subtasks are still open. Wait for their reports, then finish or decline.`,
        is_error: true,
      };
    }
    return { content: 'Task declined.', declined: input.reason };
  }
}
