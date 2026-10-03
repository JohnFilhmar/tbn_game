import type { MergeRequestStatus } from '@tbn/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { ChipGroup } from '@/components/Tabs';
import { TimeStamp } from '@/components/TimeStamp';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { byId, newestFirst } from '@/lib/data/rows';

/** Managers' requests to merge their branch into `development`, which only the owner merges. */
export function MergeRequestsScreen() {
  const requests = useCollection(COLLECTIONS.mergeRequests);
  const repositories = useCollection(COLLECTIONS.repositories);
  const [filter, setFilter] = useState<MergeRequestStatus>('open');
  const header = (
    <PageHeader
      title="Merge requests"
      description="A manager asks to merge its branch into development, with the diff, its review notes and the test output."
    />
  );
  if (requests.data === undefined || repositories.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[requests, repositories]} label="merge requests" />
      </>
    );
  }
  const repositoryById = byId(repositories.data);
  const count = (status: MergeRequestStatus): number =>
    requests.data.filter((request) => request.status === status).length;
  const shown = newestFirst(
    requests.data.filter((request) => request.status === filter),
    (request) => request.created_at,
  );
  return (
    <>
      {header}
      <ChipGroup
        label="Show"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'open', label: 'Open', count: count('open') },
          { value: 'merged', label: 'Merged', count: count('merged') },
          { value: 'closed', label: 'Closed', count: count('closed') },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'Nothing to merge' : `No ${filter} merge requests`}
          description="A manager opens one when its branch is reviewed and tested."
        />
      ) : (
        <DataTable
          caption="Merge requests"
          rows={shown}
          rowKey={(request) => request.id}
          columns={[
            {
              header: 'Branch',
              cell: (request) => (
                <Link
                  to={`/merge_requests/${request.id}`}
                  className="font-mono text-teal-800 hover:underline dark:text-teal-300"
                >
                  {request.source_branch} → {request.target_branch}
                </Link>
              ),
            },
            {
              header: 'Repository',
              cell: (request) => repositoryById.get(request.repository_id)?.name ?? 'Unknown',
            },
            { header: 'By', cell: (request) => <AgentName agentId={request.agent_id} /> },
            { header: 'Status', cell: (request) => <StatusBadge status={request.status} /> },
            {
              header: 'Opened',
              isWide: true,
              cell: (request) => <TimeStamp iso={request.created_at} />,
            },
          ]}
        />
      )}
    </>
  );
}
