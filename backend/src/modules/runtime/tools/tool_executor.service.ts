import { Injectable, Logger } from '@nestjs/common';
import type { ToolPolicies } from '@tbn/contracts';
import type { ToolUseBlock } from '@/modules/runtime/types/model_request';
import type { FinishedTask, ToolContext } from './tool.interface';
import { ToolRegistryService } from './tool_registry.service';

/** The result of one tool call, as the transcript stores it. */
export interface ExecutedToolCall {
  tool_use_id: string;
  name: string;
  content: string;
  is_error: boolean;
  finished?: FinishedTask;
}

/** Runs the tool calls of one model turn under the agent's policies. */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(private readonly registry: ToolRegistryService) {}

  /**
   * Executes every call in order. A denied, unknown or `ask` tool answers the model with an error
   * instead of running; the approval inbox for `ask` arrives in phase 1c.
   */
  async execute_all(
    calls: ToolUseBlock[],
    policies: ToolPolicies,
    context: ToolContext,
  ): Promise<ExecutedToolCall[]> {
    const results: ExecutedToolCall[] = [];
    for (const call of calls) {
      results.push(await this.execute_one(call, policies, context));
    }
    return results;
  }

  private async execute_one(
    call: ToolUseBlock,
    policies: ToolPolicies,
    context: ToolContext,
  ): Promise<ExecutedToolCall> {
    const base = { tool_use_id: call.id, name: call.name };
    const tool = this.registry.get(call.name);
    if (tool === undefined) {
      return { ...base, content: `Unknown tool: ${call.name}`, is_error: true };
    }
    const policy = this.registry.policy_of(tool, policies);
    if (policy === 'deny') {
      return { ...base, content: `The tool ${call.name} is not permitted for you`, is_error: true };
    }
    if (policy === 'ask') {
      return {
        ...base,
        content: `The tool ${call.name} needs the owner's approval, which is not available yet. Continue without it.`,
        is_error: true,
      };
    }
    const input = tool.input_schema.safeParse(call.input);
    if (!input.success) {
      const problems = input.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      return { ...base, content: `Invalid input: ${problems.join('; ')}`, is_error: true };
    }
    try {
      const outcome = await tool.execute(input.data, context);
      return {
        ...base,
        content: outcome.content,
        is_error: outcome.is_error ?? false,
        ...(outcome.finished !== undefined && { finished: outcome.finished }),
      };
    } catch (error: unknown) {
      this.logger.error(
        `Tool ${call.name} failed in run ${context.run_id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { ...base, content: `The tool ${call.name} failed`, is_error: true };
    }
  }
}
