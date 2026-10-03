import { RunSchema, RunSourceSchema, type Agent, type Run } from '@tbn/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { FormError } from '@/components/FormError';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS, queryKeys } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { byId, newestFirst } from '@/lib/data/rows';
import { useCommand } from '@/lib/data/useCommand';
import { humanize } from '@/lib/format/labels';
import { formatDuration } from '@/lib/format/time';
import { useApi } from '@/providers/SessionProvider';

function RunSources({ run }: { run: Run }) {
  const api = useApi();
  const sources = useQuery({
    queryKey: queryKeys.runSources(run.id),
    queryFn: () => api.get(`/runs/${run.id}/sources`, RunSourceSchema.array()),
  });
  if (sources.data === undefined) return <QueryStatus queries={[sources]} label="sources" />;
  if (sources.data.length === 0)
    return <p className="text-sm">This run read nothing from outside.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {sources.data.map((source) => (
        <li key={source.id} className="flex flex-col">
          <span className="font-medium">
            {humanize(source.kind)}
            {source.cached ? ' (from the cache)' : ''}
          </span>
          <span className="break-all text-slate-700 dark:text-slate-300">{source.reference}</span>
        </li>
      ))}
    </ul>
  );
}

/** The agent's runs, newest first, with stop and continue for a paused one. */
export function RunsTab() {
  const agent = useOutletContext<Agent>();
  const runs = useCollection(COLLECTIONS.runs);
  const tasks = useCollection(COLLECTIONS.tasks);
  const [sourcesOf, setSourcesOf] = useState<Run | null>(null);
  const control = useCommand(
    (api, input: { run: Run; action: 'stop' | 'continue' }, commandId) =>
      api.send('POST', `/runs/${input.run.id}/${input.action}`, RunSchema, { commandId }),
    (cache, run) => putRow(cache, COLLECTIONS.runs, run),
  );

  if (runs.data === undefined || tasks.data === undefined) {
    return <QueryStatus queries={[runs, tasks]} label="runs" />;
  }
  const own = newestFirst(
    runs.data.filter((run) => run.agent_id === agent.id),
    (run) => run.started_at,
  );
  if (own.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="A run starts when the agent takes a task or answers a message."
      />
    );
  }
  const taskById = byId(tasks.data);
  return (
    <div className="flex flex-col gap-4">
      <FormError message={control.error === null ? null : errorMessage(control.error)} />
      <DataTable
        caption={`Runs of ${agent.name}`}
        rows={own}
        rowKey={(run) => run.id}
        columns={[
          { header: 'Started', cell: (run) => <TimeStamp iso={run.started_at} /> },
          {
            header: 'Work',
            cell: (run) => {
              const task = run.task_id === null ? undefined : taskById.get(run.task_id);
              return task === undefined ? (
                'A message from you'
              ) : (
                <Link
                  to={`/tasks/${task.id}`}
                  className="text-teal-800 hover:underline dark:text-teal-300"
                >
                  {task.title}
                </Link>
              );
            },
          },
          {
            header: 'Status',
            cell: (run) => (
              <div className="flex flex-col items-start gap-1">
                <StatusBadge status={run.status} />
                {run.pause_reason !== null && (
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {humanize(run.pause_reason)}
                  </span>
                )}
                {run.error !== null && (
                  <span className="text-xs text-red-700 dark:text-red-400">{run.error}</span>
                )}
              </div>
            ),
          },
          { header: 'Turns', cell: (run) => run.turn_count, isWide: true },
          {
            header: 'Time',
            cell: (run) => formatDuration(run.started_at, run.finished_at),
            isWide: true,
          },
          {
            header: 'Read from outside',
            isWide: true,
            cell: (run) => (
              <Button size="sm" variant="ghost" onClick={() => setSourcesOf(run)}>
                {run.tainted_at === null ? 'Nothing' : 'Sources'}
              </Button>
            ),
          },
          {
            header: 'Actions',
            cell: (run) => (
              <div className="flex flex-wrap gap-2">
                {run.status === 'paused' && run.pause_reason === 'runaway_guard' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void control.submit({ run, action: 'continue' }).catch(() => undefined)
                    }
                  >
                    Continue
                  </Button>
                )}
                {run.status === 'paused' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      void control.submit({ run, action: 'stop' }).catch(() => undefined)
                    }
                  >
                    Stop
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      <Dialog
        isOpen={sourcesOf !== null}
        onClose={() => setSourcesOf(null)}
        title="What the run read from outside"
        description="Reading any of it taints the run: its outward tools then ask you first."
      >
        {sourcesOf !== null && <RunSources run={sourcesOf} />}
      </Dialog>
    </div>
  );
}
