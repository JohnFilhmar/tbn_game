import type { ToolPolicy } from '@tbn/contracts';
import type { ZodType } from 'zod';

/** What a tool knows about the run that calls it. */
export interface ToolContext {
  owner_id: string;
  agent_id: string;
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
 * A built-in tool. Each has a default policy; the agent's `tool_policy` overrides it. Tools that
 * act outside the server default to `ask`.
 */
export interface Tool<I = unknown> {
  readonly name: string;
  readonly description: string;
  readonly default_policy: ToolPolicy;
  readonly input_schema: ZodType<I>;
  execute(input: I, context: ToolContext): Promise<ToolOutcome>;
}
