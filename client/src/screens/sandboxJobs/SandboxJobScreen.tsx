import { Link, useParams } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { buttonClasses } from '@/components/Button';
import { CodeBlock } from '@/components/CodeBlock';
import { DetailList } from '@/components/DetailList';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { formatDuration } from '@/lib/format/time';

/** One sandbox job: its command, limits and mounts, and its output. */
export function SandboxJobScreen() {
  const { jobId = '' } = useParams();
  const jobs = useCollection(COLLECTIONS.sandboxJobs);
  if (jobs.data === undefined) return <QueryStatus queries={[jobs]} label="sandbox job" />;
  const job = jobs.data.find((row) => row.id === jobId);
  if (job === undefined) {
    return (
      <EmptyState
        title="This job is not kept here"
        description="Only the newest 200 jobs are listed."
        action={
          <Link to="/sandbox_jobs" className={buttonClasses('secondary')}>
            Back to the sandbox jobs
          </Link>
        }
      />
    );
  }
  const { spec } = job;
  return (
    <>
      <PageHeader
        back={{ to: '/sandbox_jobs', label: 'Sandbox jobs' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {job.kind === 'system' ? 'System job' : 'Agent command'}
            <StatusBadge status={job.status} />
          </span>
        }
        description={
          <>
            {job.kind === 'system' ? 'Run by the system' : <AgentName agentId={job.agent_id} />} ·{' '}
            <TimeStamp iso={job.created_at} isAbsolute />
          </>
        }
      />
      <Panel title="Command">
        <CodeBlock label="Arguments" text={JSON.stringify(spec.argv, null, 2)} />
        <DetailList
          items={[
            {
              term: 'Working directory',
              detail: <span className="font-mono">{spec.working_dir}</span>,
            },
            { term: 'Network', detail: spec.network === 'proxy' ? 'Egress proxy only' : 'None' },
            { term: 'Exit code', detail: job.exit_code ?? 'None' },
            {
              term: 'Time',
              detail:
                job.started_at === null
                  ? 'Not started'
                  : formatDuration(job.started_at, job.finished_at),
            },
            {
              term: 'Limits',
              detail: `${spec.limits.cpus} CPU, ${spec.limits.memory_mb} MB memory, ${spec.limits.scratch_mb} MB scratch, ${spec.limits.timeout_seconds} s, ${spec.limits.pids} processes`,
            },
            {
              term: 'Mounts',
              detail:
                spec.mounts.length === 0
                  ? 'None'
                  : spec.mounts
                      .map((mount) => `${mount.target}${mount.read_only ? ' (read only)' : ''}`)
                      .join(', '),
            },
          ]}
        />
      </Panel>
      {job.error !== null && (
        <Panel title="Error">
          <p className="text-sm text-red-800 dark:text-red-300">{job.error}</p>
        </Panel>
      )}
      <Panel title="Standard output">
        <CodeBlock label="Standard output" text={job.stdout} />
      </Panel>
      <Panel title="Standard error">
        <CodeBlock label="Standard error" text={job.stderr} />
      </Panel>
    </>
  );
}
