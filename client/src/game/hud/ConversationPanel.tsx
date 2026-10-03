import { OPEN_TASK_STATUSES } from '@tbn/contracts';
import { Button } from '@/components/Button';
import { Conversation } from '@/components/conversation/Conversation';
import { StatusBadge } from '@/components/StatusBadge';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

/** Props of `ConversationPanel`. */
export interface ConversationPanelProps {
  agentId: string;
  onClose: () => void;
}

/**
 * The owner's conversation with an agent in the world: who it is, what it is working on, its
 * live session and a message box. It slides in beside the scene rather than over it, so the world
 * stays in view; Escape anywhere inside it, or Close, ends the conversation.
 */
export function ConversationPanel({ agentId, onClose }: ConversationPanelProps) {
  const { data: agents } = useCollection(COLLECTIONS.agents);
  const { data: tasks } = useCollection(COLLECTIONS.tasks);
  const { data: runs } = useCollection(COLLECTIONS.runs);
  const agent = agents?.find((one) => one.id === agentId);
  const task = tasks?.find(
    (one) => one.assignee_agent_id === agentId && OPEN_TASK_STATUSES.includes(one.status),
  );
  const run =
    agent?.active_run_id === null || agent === undefined
      ? undefined
      : runs?.find((one) => one.id === agent.active_run_id);
  const name = agent?.name ?? 'An agent';

  return (
    <aside
      aria-label={`Conversation with ${name}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
      className="dark pointer-events-auto fixed inset-x-2 bottom-2 z-30 flex h-1/2 flex-col gap-3 rounded-lg border-2 border-slate-700 bg-slate-900/95 p-4 text-slate-100 shadow-chunk backdrop-blur motion-safe:animate-slide-in md:inset-y-3 md:right-3 md:left-auto md:h-auto md:w-1/3 md:min-w-96"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate font-display text-lg font-bold tracking-wide">{name}</h2>
          {agent !== undefined && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span>
                {agent.level === 1 ? 'Manager' : 'Intern'} · {agent.role}
              </span>
              <StatusBadge status={agent.status} />
            </p>
          )}
        </div>
        <Button size="sm" onClick={onClose} title="Close the conversation (Escape)">
          Close
        </Button>
      </header>
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
        {task === undefined ? (
          'No open task.'
        ) : (
          <>
            <span>
              On <span className="font-medium text-slate-100">&quot;{task.title}&quot;</span>
            </span>
            <StatusBadge status={task.status} />
          </>
        )}
        {run !== undefined && (
          <span className="flex items-center gap-2">
            Run <StatusBadge status={run.status} />
          </span>
        )}
      </p>
      {agent === undefined ? (
        <p className="text-sm text-slate-300">This agent is no longer in the company.</p>
      ) : (
        <Conversation agent={agent} logClassName="min-h-0 flex-1" isAutoFocused />
      )}
    </aside>
  );
}
