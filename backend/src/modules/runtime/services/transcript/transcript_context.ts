import { TranscriptContentSchemas } from '@tbn/contracts';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';

/** What a request carries of a transcript: the latest summary and the entries after it. */
export interface TranscriptContext {
  summary: string | null;
  /** The last `seq` the summary covers, 0 without one. */
  through_seq: number;
  /** The entries after the summary, compaction entries left out. */
  live: TranscriptEntryRecord[];
}

const RESULT_EXCERPT_CHARS = 2_000;
const ENTRY_EXCERPT_CHARS = 4_000;

function entry_chars(entry: TranscriptEntryRecord): number {
  return JSON.stringify(entry.content).length;
}

function excerpt(text: string, max_chars: number): string {
  return text.length <= max_chars ? text : `${text.slice(0, max_chars)} ...`;
}

/** Splits a transcript at its latest compaction entry. */
export function select_context(entries: TranscriptEntryRecord[]): TranscriptContext {
  let summary: string | null = null;
  let through_seq = 0;
  for (const entry of entries) {
    if (entry.kind !== 'compaction') continue;
    const content = TranscriptContentSchemas.compaction.safeParse(entry.content);
    if (content.success) {
      summary = content.data.summary;
      through_seq = content.data.through_seq;
    }
  }
  return {
    summary,
    through_seq,
    live: entries.filter((entry) => entry.seq > through_seq && entry.kind !== 'compaction'),
  };
}

/**
 * Where the kept part of `live` starts when the newest entries may fill `keep_chars`: everything
 * before the returned index gets summarised, and 0 means nothing can be. The kept part never
 * starts with a tool result, which must stay right after the call it answers, and it always holds
 * the last entry.
 */
/** Earlier tasks this long or longer are folded into a summary when a new task starts. */
const FOLD_AT_CHARS = 6_000;

/**
 * Where a new task begins in the live entries, when the tasks before it are long enough to fold
 * into a summary, so a session carries one task word for word; null when there is nothing to fold.
 */
export function task_fold_cut(live: TranscriptEntryRecord[]): number | null {
  let start = -1;
  for (let index = live.length - 1; index > 0; index -= 1) {
    if (live[index]?.kind === 'task_assignment') {
      start = index;
      break;
    }
  }
  if (start <= 0) return null;
  const before = live.slice(0, start).reduce((sum, entry) => sum + entry_chars(entry), 0);
  return before >= FOLD_AT_CHARS ? start : null;
}

export function compaction_cut(live: TranscriptEntryRecord[], keep_chars: number): number {
  let start = live.length;
  let kept = 0;
  for (let index = live.length - 1; index >= 0; index -= 1) {
    const entry = live[index];
    if (entry === undefined) break;
    const size = entry_chars(entry);
    if (start < live.length && kept + size > keep_chars) break;
    kept += size;
    start = index;
  }
  while (start < live.length && live[start]?.kind === 'tool_result') start += 1;
  if (start >= live.length) {
    start = live.length - 1;
    while (start > 0 && live[start]?.kind === 'tool_result') start -= 1;
  }
  return Math.max(0, start);
}

function render_entry(entry: TranscriptEntryRecord): string | null {
  switch (entry.kind) {
    case 'owner_message': {
      const content = TranscriptContentSchemas.owner_message.safeParse(entry.content);
      return content.success ? `[owner] ${excerpt(content.data.text, ENTRY_EXCERPT_CHARS)}` : null;
    }
    case 'task_assignment': {
      const content = TranscriptContentSchemas.task_assignment.safeParse(entry.content);
      return content.success
        ? `[new task] ${content.data.title}: ${excerpt(content.data.instructions, ENTRY_EXCERPT_CHARS)}`
        : null;
    }
    case 'assistant': {
      const content = TranscriptContentSchemas.assistant.safeParse(entry.content);
      if (!content.success) return null;
      return content.data.blocks
        .map((block) =>
          block.type === 'text'
            ? `[you] ${excerpt(block.text, ENTRY_EXCERPT_CHARS)}`
            : `[you called ${block.name}] ${excerpt(JSON.stringify(block.input), ENTRY_EXCERPT_CHARS)}`,
        )
        .join('\n');
    }
    case 'tool_result': {
      const content = TranscriptContentSchemas.tool_result.safeParse(entry.content);
      if (!content.success) return null;
      return content.data.results
        .map(
          (result) =>
            `[${result.name} ${result.is_error ? 'failed' : 'returned'}] ${excerpt(result.content, RESULT_EXCERPT_CHARS)}`,
        )
        .join('\n');
    }
    case 'system_note': {
      const content = TranscriptContentSchemas.system_note.safeParse(entry.content);
      return content.success ? `[system] ${content.data.text}` : null;
    }
    case 'agent_message': {
      const content = TranscriptContentSchemas.agent_message.safeParse(entry.content);
      return content.success
        ? `[${content.data.kind} from ${content.data.from_name}] ${excerpt(content.data.text, ENTRY_EXCERPT_CHARS)}`
        : null;
    }
    case 'subtask_result': {
      const content = TranscriptContentSchemas.subtask_result.safeParse(entry.content);
      if (!content.success) return null;
      const body = content.data.report_md ?? content.data.result ?? '';
      return `[subtask ${content.data.status}: ${content.data.title} by ${content.data.assignee_name}] ${excerpt(body, RESULT_EXCERPT_CHARS)}`;
    }
    case 'compaction':
      return null;
  }
}

/**
 * The text a summary is written from: the earlier summary, then the entries to fold in, each
 * shortened. When it is longer than `max_chars`, the oldest entries are left out first.
 */
export function render_for_summary(
  previous: string | null,
  entries: TranscriptEntryRecord[],
  max_chars: number,
): string {
  const head = previous === null ? '' : `Summary so far:\n${previous}\n\n`;
  const lines = entries
    .map(render_entry)
    .filter((line): line is string => line !== null && line.length > 0);
  let body = lines.join('\n');
  while (head.length + body.length > max_chars && lines.length > 1) {
    lines.shift();
    body = `(earlier entries left out)\n${lines.join('\n')}`;
  }
  return `${head}Entries to fold into the summary:\n${body}`;
}
