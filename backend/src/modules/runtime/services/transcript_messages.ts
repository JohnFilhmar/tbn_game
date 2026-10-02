import { TranscriptContentSchemas } from '@tbn/contracts';
import type {
  AssistantBlock,
  ModelMessage,
  ToolUseBlock,
  UserBlock,
} from '@/modules/runtime/types/model_request';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

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

/**
 * Turns transcript entries into the conversation a model request carries. Consecutive entries on
 * the same side merge into one message, so tool results and a message the owner sent meanwhile
 * travel together. Entries whose content does not match the contract are skipped.
 */
export function transcript_to_messages(entries: TranscriptEntryRecord[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case 'owner_message': {
        const content = TranscriptContentSchemas.owner_message.safeParse(entry.content);
        if (content.success) {
          push_user(messages, [
            { type: 'text', text: `Message from the owner:\n${content.data.text}` },
          ]);
        }
        break;
      }
      case 'task_assignment': {
        const content = TranscriptContentSchemas.task_assignment.safeParse(entry.content);
        if (content.success) {
          push_user(messages, [
            {
              type: 'text',
              text: `New task: ${content.data.title}\n\n${content.data.instructions}\n\nCall finish_task when it is complete.`,
            },
          ]);
        }
        break;
      }
      case 'assistant': {
        const content = TranscriptContentSchemas.assistant.safeParse(entry.content);
        if (content.success && content.data.blocks.length > 0) {
          push_assistant(messages, content.data.blocks);
        }
        break;
      }
      case 'tool_result': {
        const content = TranscriptContentSchemas.tool_result.safeParse(entry.content);
        if (content.success) {
          push_user(
            messages,
            content.data.results.map((result) => ({
              type: 'tool_result',
              tool_use_id: result.tool_use_id,
              content: result.content,
              is_error: result.is_error,
            })),
          );
        }
        break;
      }
      case 'system_note': {
        const content = TranscriptContentSchemas.system_note.safeParse(entry.content);
        if (content.success) {
          push_user(messages, [
            { type: 'text', text: `Note from the system: ${content.data.text}` },
          ]);
        }
        break;
      }
    }
  }
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
