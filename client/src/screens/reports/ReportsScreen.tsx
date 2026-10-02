import { Link } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { TimeStamp } from '@/components/TimeStamp';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { byId, newestFirst } from '@/lib/data/rows';

/** Every report a finished task left, newest first. */
export function ReportsScreen() {
  const reports = useCollection(COLLECTIONS.reports);
  const tasks = useCollection(COLLECTIONS.tasks);
  const header = (
    <PageHeader
      title="Reports"
      description="What each finished task produced, in Markdown, written by the agent that did it."
    />
  );
  if (reports.data === undefined || tasks.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[reports, tasks]} label="reports" />
      </>
    );
  }
  if (reports.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No reports yet"
          description="A report appears when an agent finishes a task."
        />
      </>
    );
  }
  const taskById = byId(tasks.data);
  return (
    <>
      {header}
      <DataTable
        caption="Reports"
        rows={newestFirst(reports.data, (report) => report.created_at)}
        rowKey={(report) => report.id}
        columns={[
          {
            header: 'Task',
            cell: (report) => (
              <Link
                to={`/reports/${report.id}`}
                className="font-medium text-teal-800 hover:underline dark:text-teal-300"
              >
                {taskById.get(report.task_id)?.title ?? 'A task'}
              </Link>
            ),
          },
          { header: 'By', cell: (report) => <AgentName agentId={report.agent_id} /> },
          { header: 'Written', cell: (report) => <TimeStamp iso={report.created_at} /> },
        ]}
      />
    </>
  );
}
