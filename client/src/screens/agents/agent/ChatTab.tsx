import type { Agent } from '@tbn/contracts';
import { useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { useStreamStore } from '@/lib/stores/streamStore';
import { MessageBox } from './MessageBox';
import { TranscriptEntryView } from './TranscriptEntryView';
import { useTranscript } from './useTranscript';

const STICK_DISTANCE = 80;

/** Why an agent takes no messages, or null when it does. */
function closedReason(agent: Agent): string | null {
  if (agent.status === 'dismissed') return 'This agent is dismissed and takes no messages.';
  if (agent.status === 'terminated') return 'This intern has ended and takes no messages.';
  return null;
}

/** The chat with one agent: its transcript, the reply it is writing now and the message box. */
export function ChatTab() {
  const agent = useOutletContext<Agent>();
  const transcript = useTranscript(agent.id);
  const reply = useStreamStore((state) => state.replies[agent.id]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const entryCount = transcript.data?.length ?? 0;
  const replyLength = reply?.text.length ?? 0;

  useEffect(() => {
    const box = scrollRef.current;
    if (box !== null && isAtBottomRef.current) box.scrollTop = box.scrollHeight;
  }, [entryCount, replyLength]);

  if (transcript.data === undefined) {
    return <QueryStatus queries={[transcript]} label="transcript" />;
  }
  const isStreaming = reply !== undefined && reply.text.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const box = event.currentTarget;
          isAtBottomRef.current =
            box.scrollHeight - box.scrollTop - box.clientHeight < STICK_DISTANCE;
        }}
        className="flex max-h-160 min-h-64 flex-col gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-950"
      >
        {transcript.data.length === 0 && !isStreaming ? (
          <EmptyState
            title="Nothing said yet"
            description={`Write to ${agent.name} below, or assign it a task.`}
          />
        ) : (
          <div role="log" aria-label={`Chat with ${agent.name}`} className="flex flex-col gap-4">
            {transcript.data.map((entry) => (
              <TranscriptEntryView key={entry.id} entry={entry} agentName={agent.name} />
            ))}
          </div>
        )}
        {isStreaming && (
          <div className="flex flex-col items-start gap-1" aria-hidden="true">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {agent.name} · writing…
            </span>
            <div className="max-w-prose rounded-lg border border-dashed border-teal-500 bg-white px-3 py-2 text-sm whitespace-pre-wrap dark:bg-slate-900">
              {reply.text}
            </div>
          </div>
        )}
      </div>
      <p role="status" className="sr-only">
        {isStreaming ? `${agent.name} is writing a reply.` : ''}
      </p>
      <MessageBox agentId={agent.id} agentName={agent.name} closedReason={closedReason(agent)} />
    </div>
  );
}
