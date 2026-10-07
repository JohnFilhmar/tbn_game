import type { TranscriptEntry } from '@tbn/contracts';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CodeBlock, jsonText } from '@/components/CodeBlock';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { humanize } from '@/lib/format/labels';
import { cx } from '@/lib/ui/cx';

function Bubble(props: { who: ReactNode; at: string; isOwner?: boolean; children: ReactNode }) {
  return (
    <div
      className={cx('flex flex-col gap-1', props.isOwner === true ? 'items-end' : 'items-start')}
    >
      <span className="text-xs text-slate-600 dark:text-slate-400">
        {props.who} · <TimeStamp iso={props.at} />
      </span>
      <div
        className={cx(
          'max-w-prose rounded-lg px-3 py-2',
          props.isOwner === true
            ? 'bg-teal-700 text-white dark:bg-teal-800'
            : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
        )}
      >
        {props.children}
      </div>
    </div>
  );
}

function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer text-slate-700 dark:text-slate-300">{summary}</summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}

/** Props of `TranscriptEntryView`. */
export interface TranscriptEntryViewProps {
  entry: TranscriptEntry;
  agentName: string;
}

/**
 * One transcript entry as the chat shows it: messages as bubbles, the agent's tool calls and their
 * results folded, and notes, assignments and results of delegated work as cards.
 */
export function TranscriptEntryView({ entry, agentName }: TranscriptEntryViewProps) {
  switch (entry.kind) {
    case 'owner_message':
      return (
        <Bubble who="You" at={entry.created_at} isOwner>
          <p className="text-sm whitespace-pre-wrap">{entry.content.text}</p>
        </Bubble>
      );
    case 'assistant': {
      const texts = entry.content.blocks.flatMap((block) => (block.type === 'text' ? [block] : []));
      const calls = entry.content.blocks.flatMap((block) =>
        block.type === 'tool_use' ? [block] : [],
      );
      return (
        <div className="flex flex-col gap-2">
          {texts.some((block) => block.text.trim().length > 0) && (
            <Bubble who={agentName} at={entry.created_at}>
              {texts.map((block, index) => (
                <Markdown key={index} text={block.text} />
              ))}
            </Bubble>
          )}
          {calls.map((call) => (
            <Disclosure key={call.id} summary={`${agentName} used ${call.name}`}>
              <CodeBlock label={`Input of ${call.name}`} text={jsonText(call.input)} />
            </Disclosure>
          ))}
        </div>
      );
    }
    case 'tool_result':
      return (
        <div className="flex flex-col gap-2">
          {entry.content.results.map((result) => (
            <Disclosure
              key={result.tool_use_id}
              summary={
                <span>
                  Result of {result.name}
                  {result.is_error && (
                    <span className="ml-2 font-medium text-red-700 dark:text-red-400">error</span>
                  )}
                </span>
              }
            >
              <CodeBlock label={`Result of ${result.name}`} text={result.content} />
            </Disclosure>
          ))}
        </div>
      );
    case 'task_assignment':
      return (
        <Disclosure
          summary={
            <span>
              Task assigned:{' '}
              <Link
                to={`/tasks/${entry.content.task_id}`}
                className="font-medium text-teal-800 hover:underline dark:text-teal-300"
              >
                {entry.content.title}
              </Link>
            </span>
          }
        >
          <p className="whitespace-pre-wrap">{entry.content.instructions}</p>
        </Disclosure>
      );
    case 'system_note':
      return (
        <p className="text-center text-xs text-slate-600 dark:text-slate-400">
          {entry.content.text}
        </p>
      );
    case 'agent_message':
      return (
        <Bubble
          who={`${entry.content.from_name} (${humanize(entry.content.kind).toLowerCase()})`}
          at={entry.created_at}
        >
          <Markdown text={entry.content.text} />
        </Bubble>
      );
    case 'subtask_result':
      return (
        <Disclosure
          summary={
            <span className="inline-flex flex-wrap items-center gap-2">
              {entry.content.assignee_name} finished {entry.content.title}
              <StatusBadge status={entry.content.status} />
            </span>
          }
        >
          {entry.content.result !== null && (
            <p className="whitespace-pre-wrap">{entry.content.result}</p>
          )}
          {entry.content.report_id !== null && (
            <Link
              to={`/reports/${entry.content.report_id}`}
              className="text-teal-800 hover:underline dark:text-teal-300"
            >
              Read the report
            </Link>
          )}
        </Disclosure>
      );
    case 'compaction':
      return (
        <Disclosure summary="Earlier conversation, summarized to save context">
          <Markdown text={entry.content.summary} />
        </Disclosure>
      );
  }
}
