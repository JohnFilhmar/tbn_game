import { TranscriptContentSchemas } from '@tbn/contracts';
import type {
  AssistantBlock,
  ModelMessage,
  ToolUseBlock,
  UserBlock,
} from '@/modules/runtime/types/model_request';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** How the conversation is shaped for one request. */
export interface MessageOptions {
  /** A summary of the entries before these ones, sent first. */
  summary: string | null;
  /** Tool results longer than this are shortened in the request; null keeps them whole. */
  max_tool_result_chars: number | null;
}

const SHORTENED_NOTE = '\n... shortened to fit the context window; the transcript keeps it whole.';

function push_user(messages: ModelMessage[], blocks: UserBlock[]): void {
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    last.content.push(...blocks);
  } else {
    messages.push({ role: 'user', content: blocks });
  }
}

function push_assistant(messages: ModelMessage[], blocks: AssistantBlock[]): void {
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant') {
    last.content.push(...blocks);
  } else {
    messages.push({ role: 'assistant', content: blocks });
  }
}

function shorten(text: string, max_chars: number | null): string {
  if (max_chars === null || text.length <= max_chars) return text;
  return `${text.slice(0, max_chars)}${SHORTENED_NOTE}`;
}

/**
 * Tool results answer the calls of the assistant turn before them, and both APIs want them
 * first in the user turn. A message can land between a call and its result, so they move ahead.
 */
function tool_results_first(messages: ModelMessage[]): void {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const results = message.content.filter((block) => block.type === 'tool_result');
    if (results.length === 0) continue;
    const others = message.content.filter((block) => block.type !== 'tool_result');
    message.content = [...results, ...others];
  }
}

function user_blocks(entry: TranscriptEntryRecord, options: MessageOptions): UserBlock[] {
  switch (entry.kind) {
    case 'owner_message': {
      const content = TranscriptContentSchemas.owner_message.safeParse(entry.content);
      return content.success
        ? [{ type: 'text', text: `Message from the owner:\n${content.data.text}` }]
        : [];
    }
    case 'task_assignment': {
      const content = TranscriptContentSchemas.task_assignment.safeParse(entry.content);
      return content.success
        ? [
            {
              type: 'text',
              text: `New task: ${content.data.title}\n\n${content.data.instructions}\n\nCall finish_task when it is complete.`,
            },
          ]
        : [];
    }
    case 'tool_result': {
      const content = TranscriptContentSchemas.tool_result.safeParse(entry.content);
      return content.success
        ? content.data.results.map((result) => ({
            type: 'tool_result',
            tool_use_id: result.tool_use_id,
            content: shorten(result.content, options.max_tool_result_chars),
            is_error: result.is_error,
          }))
        : [];
    }
    case 'system_note': {
      const content = TranscriptContentSchemas.system_note.safeParse(entry.content);
      return content.success
        ? [{ type: 'text', text: `Note from the system: ${content.data.text}` }]
        : [];
    }
    case 'agent_message': {
      const content = TranscriptContentSchemas.agent_message.safeParse(entry.content);
      return content.success
        ? [
            {
              type: 'text',
              text: `Message from ${content.data.from_name} (${content.data.kind}):\n${content.data.text}`,
            },
          ]
        : [];
    }
    case 'subtask_result': {
      const content = TranscriptContentSchemas.subtask_result.safeParse(entry.content);
      if (!content.success) return [];
      const result = content.data;
      const body = result.report_md ?? result.result ?? '(no report)';
      return [
        {
          type: 'text',
          text: `Subtask ${result.status}: "${result.title}" by ${result.assignee_name}.\n\n${shorten(body, options.max_tool_result_chars)}`,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Turns transcript entries into the conversation a model request carries, after an optional
 * summary of what came before. Consecutive entries on the same side merge into one message, so
 * tool results and a message that arrived meanwhile travel together. Entries whose content does
 * not match the contract are skipped, and compaction entries are carried by the summary.
 */
export function transcript_to_messages(
  entries: TranscriptEntryRecord[],
  options: MessageOptions = { summary: null, max_tool_result_chars: null },
): ModelMessage[] {
  const messages: ModelMessage[] = [];
  if (options.summary !== null) {
    push_user(messages, [
      { type: 'text', text: `Summary of your earlier work in this session:\n${options.summary}` },
    ]);
  }
  for (const entry of entries) {
    if (entry.kind === 'assistant') {
      const content = TranscriptContentSchemas.assistant.safeParse(entry.content);
      if (content.success && content.data.blocks.length > 0) {
        push_assistant(messages, content.data.blocks);
      }
      continue;
    }
    const blocks = user_blocks(entry, options);
    if (blocks.length > 0) push_user(messages, blocks);
  }
  tool_results_first(messages);
  return messages;
}

/** The tool calls of the last entry when it is an assistant turn, which are then still unanswered. */
export function pending_tool_calls(entries: TranscriptEntryRecord[]): ToolUseBlock[] {
  const last = entries[entries.length - 1];
  if (last?.kind !== 'assistant') return [];
  const content = TranscriptContentSchemas.assistant.safeParse(last.content);
  if (!content.success) return [];
  return content.data.blocks.filter((block) => block.type === 'tool_use');
}

/** The text of the last assistant entry, for a report when the model never called finish_task. */
export function last_assistant_text(entries: TranscriptEntryRecord[]): string {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind !== 'assistant') continue;
    const content = TranscriptContentSchemas.assistant.safeParse(entry.content);
    if (!content.success) continue;
    const text = content.data.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text.length > 0) return text;
  }
  return '';
}
