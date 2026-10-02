import type { ModelUsage } from './usage_record';

/** A tool the model may call, with its input as a JSON schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Text the user side sends. */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** The result of a tool call, sent back to the model. */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** A tool call the model made. */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** A block in a user message. */
export type UserBlock = TextBlock | ToolResultBlock;

/** A block in an assistant message. */
export type AssistantBlock = TextBlock | ToolUseBlock;

/** One message of the conversation, in the provider-neutral shape. */
export type ModelMessage =
  { role: 'user'; content: UserBlock[] } | { role: 'assistant'; content: AssistantBlock[] };

/** A request to a model. The system prompt and the tools form the stable, cacheable prefix. */
export interface ModelRequest {
  system: string;
  tools: ToolDefinition[];
  messages: ModelMessage[];
}

/** Why the model stopped. */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other';

/** A model's answer in the provider-neutral shape. */
export interface ModelResponse {
  content: AssistantBlock[];
  stop_reason: StopReason;
  usage: ModelUsage;
}
