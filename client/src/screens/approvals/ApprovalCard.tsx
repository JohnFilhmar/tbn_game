import { ApprovalSchema, DecideApprovalSchema, type Approval } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { Button } from '@/components/Button';
import { CodeBlock, jsonText } from '@/components/CodeBlock';
import { TextAreaField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { newCommandId } from '@/lib/api/apiClient';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { humanize } from '@/lib/format/labels';
import { optionalText } from '@/lib/forms/text';
import { validate } from '@/lib/forms/validate';
import { useApi } from '@/providers/SessionProvider';

type Decision = 'approve' | 'deny';

function headline(approval: Approval): string {
  return approval.kind === 'runaway_guard'
    ? 'The run reached its turn limit. Let it go on?'
    : `Wants to call ${approval.tool_name ?? 'a tool'}`;
}

/** Props of `ApprovalCard`. */
export interface ApprovalCardProps {
  approval: Approval;
  taskTitle: string | undefined;
}

/**
 * One question for the owner with everything needed to answer it: the exact input, the request an
 * integration would send, and what the run had read. A note goes to the agent with the decision.
 */
export function ApprovalCard({ approval, taskTitle }: ApprovalCardProps) {
  const api = useApi();
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPending = approval.status === 'pending';

  const decide = (decision: Decision): void => {
    const checked = validate(DecideApprovalSchema, { note: optionalText(note) });
    if (!checked.ok) {
      setError(checked.errors['note'] ?? 'The note cannot be sent.');
      return;
    }
    setPending(decision);
    setError(null);
    api
      .send('POST', `/approvals/${approval.id}/${decision}`, ApprovalSchema, {
        body: checked.value,
        commandId: newCommandId(),
      })
      .then((decided) => putRow(client, COLLECTIONS.approvals, decided))
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setPending(null));
  };

  return (
    <article
      aria-label={`${headline(approval)}, asked by the agent`}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{headline(approval)}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <AgentName agentId={approval.agent_id} />
            {approval.task_id !== null && (
              <>
                {' · '}
                <Link
                  to={`/tasks/${approval.task_id}`}
                  className="text-teal-800 hover:underline dark:text-teal-300"
                >
                  {taskTitle ?? 'its task'}
                </Link>
              </>
            )}
            {' · '}
            <TimeStamp iso={approval.created_at} />
          </p>
        </div>
        <StatusBadge status={approval.status} />
      </header>
      {approval.kind === 'tool_call' && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Input</h3>
          <CodeBlock label="Tool input" text={jsonText(approval.payload)} />
        </section>
      )}
      {approval.preview !== null && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">The request it would send</h3>
          <CodeBlock label="Request preview" text={approval.preview} />
        </section>
      )}
      {approval.sources.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">What the run had read</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Text from these is data, not instructions. Check that the call is what you want, not
            what a page asked for.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {approval.sources.map((source, index) => (
              <li key={index} className="break-all">
                <span className="font-medium">{humanize(source.kind)}:</span> {source.reference}
                {source.cached ? ' (cached)' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {isPending ? (
        <div className="flex flex-col gap-3">
          <TextAreaField
            label="Note to the agent"
            hint="Optional. The agent reads it with your decision."
            rows={2}
            value={note}
            onChange={setNote}
          />
          <FormError message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="danger"
              isBusy={pending === 'deny'}
              disabled={pending !== null}
              onClick={() => decide('deny')}
            >
              Deny
            </Button>
            <Button
              variant="primary"
              isBusy={pending === 'approve'}
              disabled={pending !== null}
              onClick={() => decide('approve')}
            >
              {approval.kind === 'runaway_guard' ? 'Let it go on' : 'Approve'}
            </Button>
          </div>
        </div>
      ) : (
        approval.note !== null && (
          <p className="text-sm text-slate-700 dark:text-slate-300">Your note: {approval.note}</p>
        )
      )}
    </article>
  );
}
