import { MergeRequestSchema, type MergeRequest } from '@tbn/contracts';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { Button, buttonClasses } from '@/components/Button';
import { CodeBlock } from '@/components/CodeBlock';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';

type Decision = 'merge' | 'close';

/** One merge request: what changes and why, and the owner's merge or close. */
export function MergeRequestScreen() {
  const { mergeRequestId = '' } = useParams();
  const requests = useCollection(COLLECTIONS.mergeRequests);
  const repositories = useCollection(COLLECTIONS.repositories);
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const decide = useCommand(
    (api, input: { request: MergeRequest; decision: Decision }, commandId) =>
      api.send(
        'POST',
        `/merge_requests/${input.request.id}/${input.decision}`,
        MergeRequestSchema,
        { commandId },
      ),
    (cache, request) => putRow(cache, COLLECTIONS.mergeRequests, request),
  );

  if (requests.data === undefined)
    return <QueryStatus queries={[requests]} label="merge request" />;
  const request = requests.data.find((row) => row.id === mergeRequestId);
  if (request === undefined) {
    return (
      <EmptyState
        title="This merge request does not exist"
        action={
          <Link to="/merge_requests" className={buttonClasses('secondary')}>
            Back to the merge requests
          </Link>
        }
      />
    );
  }
  const repository = repositories.data?.find((row) => row.id === request.repository_id);
  const isOpen = request.status === 'open';
  return (
    <>
      <PageHeader
        back={{ to: '/merge_requests', label: 'Merge requests' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">
              {request.source_branch} → {request.target_branch}
            </span>
            <StatusBadge status={request.status} />
          </span>
        }
        description={
          <>
            {repository?.name ?? 'A repository'} · by <AgentName agentId={request.agent_id} /> ·
            opened <TimeStamp iso={request.created_at} /> · head {request.head_sha.slice(0, 8)}
            {request.merge_sha !== null && ` · merged as ${request.merge_sha.slice(0, 8)}`}
          </>
        }
        actions={
          isOpen && (
            <>
              <Button onClick={() => setDeciding('close')}>Close</Button>
              <Button variant="primary" onClick={() => setDeciding('merge')}>
                Merge
              </Button>
            </>
          )
        }
      />
      <Panel title="Review notes">
        {request.review_notes.trim().length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">None.</p>
        ) : (
          <Markdown text={request.review_notes} />
        )}
      </Panel>
      <Panel title="Test output">
        {request.test_output === null ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">No test was run.</p>
        ) : (
          <CodeBlock label="Test output" text={request.test_output} />
        )}
      </Panel>
      <Panel title="Commits">
        <CodeBlock label="Commit log" text={request.log} />
      </Panel>
      <Panel title="Diff">
        <CodeBlock label="Diff" text={request.diff} isDiff isCapped={false} />
      </Panel>
      <ConfirmDialog
        isOpen={deciding !== null}
        title={
          deciding === 'merge' ? `Merge into ${request.target_branch}?` : 'Close without merging?'
        }
        message={
          deciding === 'merge'
            ? `The server merges ${request.source_branch} at ${request.head_sha.slice(0, 8)} into ${request.target_branch}.`
            : 'The branch stays; the request is closed.'
        }
        confirmLabel={deciding === 'merge' ? 'Merge' : 'Close'}
        confirmVariant={deciding === 'merge' ? 'primary' : 'danger'}
        cancelLabel="Not now"
        isBusy={decide.isPending}
        error={decide.error === null ? null : errorMessage(decide.error)}
        onCancel={() => {
          setDeciding(null);
          decide.reset();
        }}
        onConfirm={() => {
          if (deciding === null) return;
          decide
            .submit({ request, decision: deciding })
            .then(() => setDeciding(null))
            .catch(() => undefined);
        }}
      />
    </>
  );
}
