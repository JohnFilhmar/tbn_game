import { OPEN_TASK_STATUSES, type Task } from '@tbn/contracts';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { ChipGroup } from '@/components/Tabs';
import { TimeStamp } from '@/components/TimeStamp';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { newestFirst } from '@/lib/data/rows';
import { AssignTaskForm } from './AssignTaskForm';

type TaskFilter = 'open' | 'done' | 'failed' | 'cancelled' | 'declined' | 'all';

function matches(task: Task, filter: TaskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return OPEN_TASK_STATUSES.includes(task.status);
  return task.status === filter;
}

/** The task board: every task by status, assigning a new one, and each task's detail a click away. */
export function TasksScreen() {
  const tasks = useCollection(COLLECTIONS.tasks);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const assignTo = searchParams.get('assign');
  const [filter, setFilter] = useState<TaskFilter>('open');
  const openForm = (agentId: string): void => setSearchParams({ assign: agentId });
  const closeForm = (): void => setSearchParams({});

  const header = (
    <PageHeader
      title="Tasks"
      description="Work you gave your managers and the subtasks they handed to interns."
      actions={
        <Button variant="primary" onClick={() => openForm('')}>
          Assign a task
        </Button>
      }
    />
  );
  const dialog = (
    <Dialog isOpen={assignTo !== null} onClose={closeForm} title="Assign a task">
      {assignTo !== null && (
        <AssignTaskForm
          assigneeId={assignTo}
          onDone={(taskId) => {
            if (taskId === null) closeForm();
            else void navigate(`/tasks/${taskId}`);
          }}
        />
      )}
    </Dialog>
  );
  if (tasks.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[tasks]} label="tasks" />
        {dialog}
      </>
    );
  }
  const shown = newestFirst(
    tasks.data.filter((task) => matches(task, filter)),
    (task) => task.created_at,
  );
  const count = (value: TaskFilter): number =>
    tasks.data.filter((task) => matches(task, value)).length;
  return (
    <>
      {header}
      <ChipGroup
        label="Show"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'open', label: 'Open', count: count('open') },
          { value: 'done', label: 'Done', count: count('done') },
          { value: 'failed', label: 'Failed', count: count('failed') },
          { value: 'cancelled', label: 'Cancelled', count: count('cancelled') },
          { value: 'declined', label: 'Declined', count: count('declined') },
          { value: 'all', label: 'All', count: count('all') },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={tasks.data.length === 0 ? 'No tasks yet' : 'No task matches'}
          description={
            tasks.data.length === 0
              ? 'Assign your first task to a manager.'
              : 'Choose another filter above.'
          }
        />
      ) : (
        <DataTable
          caption="Tasks"
          rows={shown}
          rowKey={(task) => task.id}
          columns={[
            {
              header: 'Task',
              cell: (task) => (
                <Link
                  to={`/tasks/${task.id}`}
                  className="font-medium text-teal-800 hover:underline dark:text-teal-300"
                >
                  {task.title}
                </Link>
              ),
            },
            { header: 'Assignee', cell: (task) => <AgentName agentId={task.assignee_agent_id} /> },
            {
              header: 'Status',
              cell: (task) => (
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge status={task.status} />
                  {task.status_reason !== null && (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {task.status_reason}
                    </span>
                  )}
                </div>
              ),
            },
            {
              header: 'From',
              isWide: true,
              cell: (task) => <AgentName agentId={task.delegator_agent_id} />,
            },
            {
              header: 'Created',
              isWide: true,
              cell: (task) => <TimeStamp iso={task.created_at} />,
            },
          ]}
        />
      )}
      {dialog}
    </>
  );
}
