import type { SandboxJobStatus } from '@tbn/contracts';
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
import { newestFirst } from '@/lib/data/rows';
import { formatDuration } from '@/lib/format/time';

type JobFilter = 'all' | 'active' | 'failed';

const ACTIVE: readonly SandboxJobStatus[] = ['queued', 'running'];
const FAILED: readonly SandboxJobStatus[] = ['failed', 'timed_out', 'lost'];

/** The command of a job, shortened for a table cell. */
export function commandOf(argv: readonly string[]): string {
  const text = argv.join(' ');
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** What ran in the sandbox: agents' commands and the system's git jobs, newest first. */
export function SandboxJobsScreen() {
  const jobs = useCollection(COLLECTIONS.sandboxJobs);
  const [filter, setFilter] = useState<JobFilter>('all');
  const header = (
    <PageHeader
      title="Sandbox jobs"
      description="Each job is one fresh container with no network but the egress proxy. The newest 200 are kept here."
    />
  );
  if (jobs.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[jobs]} label="sandbox jobs" />
      </>
    );
  }
  const matches = (status: SandboxJobStatus, value: JobFilter): boolean =>
    value === 'all' || (value === 'active' ? ACTIVE : FAILED).includes(status);
  const shown = newestFirst(
    jobs.data.filter((job) => matches(job.status, filter)),
    (job) => job.created_at,
  );
  const count = (value: JobFilter): number =>
    jobs.data.filter((job) => matches(job.status, value)).length;
  return (
    <>
      {header}
      <ChipGroup
        label="Show"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'all', label: 'All', count: count('all') },
          { value: 'active', label: 'Queued or running', count: count('active') },
          { value: 'failed', label: 'Failed', count: count('failed') },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={jobs.data.length === 0 ? 'Nothing ran yet' : 'No job matches'}
          description={
            jobs.data.length === 0
              ? 'Jobs appear when an agent runs a command or a repository changes.'
              : 'Choose another filter above.'
          }
        />
      ) : (
        <DataTable
          caption="Sandbox jobs"
          rows={shown}
          rowKey={(job) => job.id}
          columns={[
            {
              header: 'Command',
              cell: (job) => (
                <Link
                  to={`/sandbox_jobs/${job.id}`}
                  className="font-mono text-xs text-teal-800 hover:underline dark:text-teal-300"
                >
                  {commandOf(job.spec.argv)}
                </Link>
              ),
            },
            {
              header: 'By',
              cell: (job) =>
                job.kind === 'system' ? 'System' : <AgentName agentId={job.agent_id} />,
            },
            {
              header: 'Status',
              cell: (job) => (
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.exit_code !== null && (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      exit {job.exit_code}
                    </span>
                  )}
                </span>
              ),
            },
            {
              header: 'Time',
              isWide: true,
              cell: (job) =>
                job.started_at === null
                  ? 'Not started'
                  : formatDuration(job.started_at, job.finished_at),
            },
            { header: 'Created', isWide: true, cell: (job) => <TimeStamp iso={job.created_at} /> },
          ]}
        />
      )}
    </>
  );
}
