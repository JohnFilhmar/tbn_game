import { Injectable, Logger } from '@nestjs/common';
import type { ToolPolicies } from '@tbn/contracts';
import { ApprovalService } from '@/modules/runtime/services/approvals/approval.service';
import type { ToolUseBlock } from '@/modules/runtime/types/model_request';
import type { FinishedTask, Tool, ToolContext } from './tool.interface';
import { ToolRegistryService } from './tool_registry.service';

/** The result of one tool call, as the transcript stores it. */
export interface ExecutedToolCall {
  tool_use_id: string;
  name: string;
  content: string;
  is_error: boolean;
  finished?: FinishedTask;
}

/** How a tool phase ended: every call has a result, or some calls wait for the owner. */
export type ToolPhase =
  { results: ExecutedToolCall[] } | { awaiting: { tool_use_id: string; name: string }[] };

/** What the executor decided about one call before running anything. */
type Plan =
  | { call: ToolUseBlock; tool: Tool; approved: boolean }
  | { call: ToolUseBlock; refusal: ExecutedToolCall }
  | { call: ToolUseBlock; tool: Tool; awaiting: true };

/**
 * Runs the tool calls of one model turn under the agent's policies. A call whose policy is `ask`,
 * and every outward call of a run that has read outside content, waits for the owner: nothing in
 * the turn runs until every such call is decided, then the approved ones run and the denied ones
 * answer the model with the owner's note.
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly approvals: ApprovalService,
  ) {}

  /**
   * Plans every call first, asking the owner where the rules say so, then executes in order.
   *
   * @param tainted - True when the run has read outside content: outward tools then need approval.
   */
  async execute_all(
    calls: ToolUseBlock[],
    policies: ToolPolicies,
    context: ToolContext,
    tainted: boolean,
  ): Promise<ToolPhase> {
    const plans: Plan[] = [];
    for (const call of calls) plans.push(await this.plan(call, policies, context, tainted));
    const awaiting = plans.flatMap((plan) =>
      'awaiting' in plan ? [{ tool_use_id: plan.call.id, name: plan.call.name }] : [],
    );
    if (awaiting.length > 0) {
      for (const plan of plans) {
        if ('awaiting' in plan) {
          const preview =
            plan.tool.preview === undefined ? null : await this.preview(plan, context);
          await this.approvals.request_for_call(context, plan.call, preview);
        }
      }
      return { awaiting };
    }
    const results: ExecutedToolCall[] = [];
    for (const plan of plans) {
      if ('refusal' in plan) {
        results.push(plan.refusal);
      } else if ('approved' in plan) {
        results.push(await this.execute_one(plan.call, plan.tool, context));
      }
    }
    return { results };
  }

  private async plan(
    call: ToolUseBlock,
    policies: ToolPolicies,
    context: ToolContext,
    tainted: boolean,
  ): Promise<Plan> {
    const base = { tool_use_id: call.id, name: call.name };
    const tool = this.registry.get(call.name);
    if (tool === undefined) {
      return { call, refusal: { ...base, content: `Unknown tool: ${call.name}`, is_error: true } };
    }
    if (!this.registry.available_to(tool, context.agent.level)) {
      return {
        call,
        refusal: {
          ...base,
          content: `The tool ${call.name} is not available to agents at your level`,
          is_error: true,
        },
      };
    }
    const policy = this.registry.policy_of(tool, policies);
    if (policy === 'deny') {
      return {
        call,
        refusal: {
          ...base,
          content: `The tool ${call.name} is not permitted for you`,
          is_error: true,
        },
      };
    }
    const needs_owner = policy === 'ask' || (tool.outward === true && tainted);
    if (!needs_owner) return { call, tool, approved: true };
    const decision = await this.approvals.decision_for_call(
      context.owner_id,
      context.run_id,
      call.id,
    );
    if (decision === null || decision === 'pending') return { call, tool, awaiting: true };
    if (decision.status === 'approved') return { call, tool, approved: true };
    return {
      call,
      refusal: {
        ...base,
        content: `The owner denied this call${decision.note === null ? '.' : `: ${decision.note}`}`,
        is_error: true,
      },
    };
  }

  private async preview(
    plan: { call: ToolUseBlock; tool: Tool },
    context: ToolContext,
  ): Promise<string | null> {
    const input = plan.tool.input_schema.safeParse(plan.call.input);
    if (!input.success || plan.tool.preview === undefined) return null;
    try {
      return await plan.tool.preview(input.data, context);
    } catch {
      return null;
    }
  }

  private async execute_one(
    call: ToolUseBlock,
    tool: Tool,
    context: ToolContext,
  ): Promise<ExecutedToolCall> {
    const base = { tool_use_id: call.id, name: call.name };
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
