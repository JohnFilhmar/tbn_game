import type { ApiFormat } from '@tbn/contracts';
import { z } from 'zod';
import type { RecordedRequest, ScriptedReply } from './fake_provider_server';

/** A model request as a test reads it, the same for both API formats. */
export interface RequestView {
  system: string;
  /** The agent the request is for, read from the system prompt. */
  agent_name: string | null;
  tools: string[];
  /** Every user-side text block, oldest first. */
  user_texts: string[];
  /** Every tool result, oldest first. */
  tool_results: string[];
  /** The last message's text or tool result, which the model answers. */
  last: string;
}

const AnthropicBlockSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  content: z.unknown().optional(),
});

const AnthropicBodySchema = z.looseObject({
  system: z.union([z.string(), z.array(z.looseObject({ text: z.string() }))]),
  tools: z.array(z.looseObject({ name: z.string() })).optional(),
  messages: z.array(
    z.looseObject({
      role: z.string(),
      content: z.union([z.string(), z.array(AnthropicBlockSchema)]),
    }),
  ),
});

const OpenAiBodySchema = z.looseObject({
  tools: z.array(z.looseObject({ function: z.looseObject({ name: z.string() }) })).optional(),
  messages: z.array(
    z.looseObject({ role: z.string(), content: z.union([z.string(), z.null()]).optional() }),
  ),
});

function agent_name(system: string): string | null {
  return /You are (.+?), /.exec(system)?.[1] ?? null;
}

function read_anthropic(body: unknown): RequestView {
  const parsed = AnthropicBodySchema.parse(body);
  const system =
    typeof parsed.system === 'string'
      ? parsed.system
      : parsed.system.map((block) => block.text).join('\n');
  const user_texts: string[] = [];
  const tool_results: string[] = [];
  let last = '';
  for (const message of parsed.messages) {
    if (message.role !== 'user') continue;
    const blocks =
      typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : message.content;
    for (const block of blocks) {
      if (block.type === 'text' && block.text !== undefined) {
        user_texts.push(block.text);
        last = block.text;
      } else if (block.type === 'tool_result') {
        const text =
          typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
        tool_results.push(text);
        last = text;
      }
    }
  }
  return {
    system,
    agent_name: agent_name(system),
    tools: (parsed.tools ?? []).map((tool) => tool.name),
    user_texts,
    tool_results,
    last,
  };
}

function read_openai(body: unknown): RequestView {
  const parsed = OpenAiBodySchema.parse(body);
  const system = parsed.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content ?? '')
    .join('\n');
  const user_texts: string[] = [];
  const tool_results: string[] = [];
  let last = '';
  for (const message of parsed.messages) {
    const text = message.content ?? '';
    if (message.role === 'user') {
      user_texts.push(text);
      last = text;
    } else if (message.role === 'tool') {
      tool_results.push(text);
      last = text;
    }
  }
  return {
    system,
    agent_name: agent_name(system),
    tools: (parsed.tools ?? []).map((tool) => tool.function.name),
    user_texts,
    tool_results,
    last,
  };
}

/** Reads a recorded request in either API format. */
export function read_request(recorded: RecordedRequest, api_format: ApiFormat): RequestView {
  return api_format === 'anthropic_messages'
    ? read_anthropic(recorded.body)
    : read_openai(recorded.body);
}

/** A `finish_task` reply with a short report. */
export function finish_reply(outcome: string): ScriptedReply {
  return {
    type: 'tool_use',
    name: 'finish_task',
    input: { outcome, what_was_done: 'Did the work.', decisions: '', open_questions: '' },
  };
}

/** Counts the subtask results a manager has been given so far. */
export function subtask_results_seen(view: RequestView): number {
  return view.user_texts.filter((text) => text.startsWith('Subtask ')).length;
}
