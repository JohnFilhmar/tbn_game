import type { AgentLevel, ToolPolicy } from '@tbn/contracts';
import type { ZodType } from 'zod';
import type { AgentRecord } from '@/modules/company/types/company_records';

/** What a tool knows about the run that calls it. */
export interface ToolContext {
  owner_id: string;
  agent_id: string;
  /** The calling agent as it was when the turn started. */
  agent: AgentRecord;
  run_id: string;
  task_id: string | null;
  /** The owner's workspace directory, an absolute path. */
  workspace_dir: string;
}

/** The report fields the `finish_task` tool collects. */
export interface FinishedTask {
  outcome: string;
  what_was_done: string;
  decisions: string;
  open_questions: string;
}

/** What a tool call produced: text for the model, and for `finish_task`, the finished report. */
export interface ToolOutcome {
  content: string;
  is_error?: boolean;
  finished?: FinishedTask;
}

/**
 * A tool. Each has a default policy; the agent's `tool_policy` overrides it. Tools that act
 * outside the server are `outward`, default to `ask`, and in a run that has read outside content
 * wait for the owner whatever the policy says. `levels` limits a tool to some agent levels.
 */
export interface Tool<I = unknown> {
  readonly name: string;
  readonly description: string;
  readonly default_policy: ToolPolicy;
  readonly levels?: readonly AgentLevel[];
  /** True for integrations and plugins: the call leaves the server. */
  readonly outward?: boolean;
  readonly input_schema: ZodType<I>;
  /** The definition the model sees, when it is not derived from `input_schema`: plugin tools. */
  readonly json_schema?: Record<string, unknown>;
  execute(input: I, context: ToolContext): Promise<ToolOutcome>;
  /** What the call would send, with secrets redacted, for the owner's inbox. */
  preview?(input: I, context: ToolContext): Promise<string | null>;
}
