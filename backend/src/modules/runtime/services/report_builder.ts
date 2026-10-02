import type { Preferences, TaskStatus } from '@tbn/contracts';
import type { FinishedTask } from '@/modules/runtime/tools/tool.interface';
import type { UsageTotals } from '@/modules/runtime/types/usage_record';

/** One delegated task as a condensed report lists it. */
export interface SubtaskLine {
  title: string;
  assignee_name: string;
  status: TaskStatus;
  report_id: string | null;
}

/** What a report is about. */
export interface ReportSubject {
  task_title: string;
  agent_name: string;
  report_style: Preferences['report_style'];
}

function section(title: string, body: string, style: Preferences['report_style']): string | null {
  const text = body.trim();
  if (text.length === 0 && style === 'concise') return null;
  return `## ${title}\n\n${text.length > 0 ? text : '(none)'}`;
}

function subtask_line(line: SubtaskLine): string {
  const report = line.report_id === null ? '' : ` (report ${line.report_id})`;
  return `- ${line.title}: ${line.status}, by ${line.assignee_name}${report}`;
}

/**
 * Renders the Markdown report of a finished task: outcome first, then what was done, what was
 * decided, open questions, the subtasks it delegated, one line each, and the tokens and cost the
 * runtime counted for the task and every task beneath it.
 */
export function render_report(
  subject: ReportSubject,
  finished: FinishedTask,
  usage: UsageTotals,
  subtasks: SubtaskLine[] = [],
): string {
  const style = subject.report_style;
  const usage_lines = [
    `- Requests: ${usage.requests}`,
    `- Input tokens: ${usage.input_tokens} (cache reads ${usage.cache_read_tokens}, cache writes ${usage.cache_write_tokens})`,
    `- Output tokens: ${usage.output_tokens}`,
    `- Cost: $${usage.cost.toFixed(4)}`,
  ].join('\n');
  const parts = [
    `# ${subject.task_title}`,
    `By ${subject.agent_name}.`,
    `## Outcome\n\n${finished.outcome.trim()}`,
    section('What was done', finished.what_was_done, style),
    section('What was decided', finished.decisions, style),
    section('Open questions', finished.open_questions, style),
    subtasks.length > 0 ? `## Subtasks\n\n${subtasks.map(subtask_line).join('\n')}` : null,
    `## Tokens and cost\n\n${subtasks.length > 0 ? `This task and its ${subtasks.length} subtasks.\n\n` : ''}${usage_lines}`,
  ];
  return `${parts.filter((part) => part !== null).join('\n\n')}\n`;
}
