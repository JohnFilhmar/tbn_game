import { RepositorySchema, type BranchReview, type Repository } from '@tbn/contracts';
import { useState } from 'react';
import { AgentName } from '@/components/AgentName';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog } from '@/components/Dialog';
import { FormError } from '@/components/FormError';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { errorMessage } from '@/lib/api/apiError';
import { dropRow, putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { newestFirst } from '@/lib/data/rows';
import { useCommand } from '@/lib/data/useCommand';
import { RepositoryForm } from './RepositoryForm';

function Reviews({ reviews }: { reviews: BranchReview[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">No branch reviews yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {reviews.map((review) => (
        <li key={review.id}>
          <details className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <span className="font-mono">{review.branch}</span>
              <StatusBadge status={review.verdict} />
              <span className="text-slate-600 dark:text-slate-400">
                by <AgentName agentId={review.reviewer_agent_id} isPlain /> at{' '}
                {review.head_sha.slice(0, 8)}, <TimeStamp iso={review.created_at} />
              </span>
            </summary>
            <div className="mt-2">
              <Markdown text={review.findings} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** The repositories agents work on, with their branch reviews; register, refresh and delete. */
export function RepositoriesScreen() {
  const repositories = useCollection(COLLECTIONS.repositories);
  const reviews = useCollection(COLLECTIONS.branchReviews);
  const [isAdding, setIsAdding] = useState(false);
  const [deleting, setDeleting] = useState<Repository | null>(null);
  const refresh = useCommand(
    (api, id: string, commandId) =>
      api.send('POST', `/repositories/${id}/fetch`, RepositorySchema, { commandId }),
    (cache, repository) => putRow(cache, COLLECTIONS.repositories, repository),
  );
  const remove = useCommand(
    (api, id: string, commandId) =>
      api.sendNoContent('DELETE', `/repositories/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.repositories, id),
  );

  const header = (
    <PageHeader
      title="Repositories"
      description="Code your agents work on. Interns publish feature branches, managers their own main; only you merge into development."
      actions={
        <Button variant="primary" onClick={() => setIsAdding(true)}>
          Register a repository
        </Button>
      }
    />
  );
  const dialogs = (
    <>
      <Dialog isOpen={isAdding} onClose={() => setIsAdding(false)} title="Register a repository">
        {isAdding && <RepositoryForm onDone={() => setIsAdding(false)} />}
      </Dialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete ${deleting?.name ?? 'the repository'}?`}
        message="The canonical repository and every checkout of it are removed from the server. A remote is not touched."
        confirmLabel="Delete"
        isBusy={remove.isPending}
        error={remove.error === null ? null : errorMessage(remove.error)}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (deleting === null) return;
          remove
            .submit(deleting.id)
            .then(() => setDeleting(null))
            .catch(() => undefined);
        }}
      />
    </>
  );
  if (repositories.data === undefined || reviews.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[repositories, reviews]} label="repositories" />
        {dialogs}
      </>
    );
  }
  return (
    <>
      {header}
      <FormError message={refresh.error === null ? null : errorMessage(refresh.error)} />
      {repositories.data.length === 0 ? (
        <EmptyState
          title="No repositories yet"
          description="Register an empty repository, or clone a public one, before you give agents code tasks."
        />
      ) : (
        [...repositories.data]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((repository) => (
            <Panel
              key={repository.id}
              title={repository.name}
              description={`${repository.remote_url ?? 'No remote'} · default branch ${repository.default_branch}`}
              actions={
                <>
                  {repository.remote_url !== null && (
                    <Button
                      size="sm"
                      onClick={() => void refresh.submit(repository.id).catch(() => undefined)}
                    >
                      Fetch the remote<span className="sr-only"> of {repository.name}</span>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(repository)}>
                    Delete<span className="sr-only"> {repository.name}</span>
                  </Button>
                </>
              }
            >
              <Reviews
                reviews={newestFirst(
                  reviews.data.filter((review) => review.repository_id === repository.id),
                  (review) => review.created_at,
                )}
              />
            </Panel>
          ))
      )}
      {dialogs}
    </>
  );
}
