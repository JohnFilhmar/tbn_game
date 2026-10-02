import type { Agent } from '@tbn/contracts';
import { Link, useOutletContext } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { AgentName } from '@/components/AgentName';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { newestFirst } from '@/lib/data/rows';

/** The tasks given to the agent, by you or by its manager, newest first. */
export function TasksTab() {
  const agent = useOutletContext<Agent>();
  const tasks = useCollection(COLLECTIONS.tasks);
  if (tasks.data === undefined) return <QueryStatus queries={[tasks]} label="tasks" />;
  const own = newestFirst(
    tasks.data.filter((task) => task.assignee_agent_id === agent.id),
    (task) => task.created_at,
  );
  if (own.length === 0) {
    return (
      <EmptyState
        title="No tasks yet"
        action={
          <Link
            to={`/tasks?assign=${agent.id}`}
            className="text-sm text-teal-800 underline dark:text-teal-300"
          >
            Assign a task to {agent.name}
          </Link>
        }
      />
    );
  }
  return (
    <DataTable
      caption={`Tasks of ${agent.name}`}
      rows={own}
      rowKey={(task) => task.id}
      columns={[
        {
          header: 'Task',
          cell: (task) => (
            <Link
              to={`/tasks/${task.id}`}
              className="text-teal-800 hover:underline dark:text-teal-300"
            >
              {task.title}
            </Link>
          ),
        },
        { header: 'Status', cell: (task) => <StatusBadge status={task.status} /> },
        {
          header: 'From',
          cell: (task) => <AgentName agentId={task.delegator_agent_id} />,
          isWide: true,
        },
        { header: 'Created', cell: (task) => <TimeStamp iso={task.created_at} />, isWide: true },
      ]}
    />
  );
}
