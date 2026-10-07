import { OPEN_TASK_STATUSES, TaskSchema } from '@tbn/contracts';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { Button, buttonClasses } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DetailList } from '@/components/DetailList';
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
import { useCollection, useTimeZone } from '@/lib/data/queries';
import { oldestFirst } from '@/lib/data/rows';
import { useCommand } from '@/lib/data/useCommand';
import { withReadableTimes } from '@/lib/format/time';

const LINK = 'text-teal-800 hover:underline dark:text-teal-300';

/** One task: what was asked, where it stands, its subtasks, its result and its report. */
export function TaskScreen() {
  const { taskId = '' } = useParams();
  const tasks = useCollection(COLLECTIONS.tasks);
  const repositories = useCollection(COLLECTIONS.repositories);
  const timeZone = useTimeZone();
  const [isCancelling, setIsCancelling] = useState(false);
  const cancel = useCommand(
    (api, id: string, commandId) =>
      api.send('POST', `/tasks/${id}/cancel`, TaskSchema, { commandId }),
    (cache, task) => putRow(cache, COLLECTIONS.tasks, task),
  );

  if (tasks.data === undefined) return <QueryStatus queries={[tasks]} label="task" />;
  const task = tasks.data.find((row) => row.id === taskId);
  if (task === undefined) {
    return (
      <EmptyState
        title="This task does not exist"
        action={
          <Link to="/tasks" className={buttonClasses('secondary')}>
            Back to the tasks
          </Link>
        }
      />
    );
  }
  const subtasks = oldestFirst(
    tasks.data.filter((row) => row.parent_task_id === task.id),
    (row) => row.created_at,
  );
  const parent = tasks.data.find((row) => row.id === task.parent_task_id);
  const repository = repositories.data?.find((row) => row.id === task.repository_id);
  const isOpen = OPEN_TASK_STATUSES.includes(task.status);

  return (
    <>
      <PageHeader
        back={{ to: '/tasks', label: 'Tasks' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {task.title}
            <StatusBadge status={task.status} />
          </span>
        }
        description={
          task.status_reason === null ? undefined : withReadableTimes(task.status_reason, timeZone)
        }
        actions={
          <>
            {task.report_id !== null && (
              <Link to={`/reports/${task.report_id}`} className={buttonClasses('primary')}>
                Read the report
              </Link>
            )}
            {isOpen && (
              <Button variant="danger" onClick={() => setIsCancelling(true)}>
                Cancel task
              </Button>
            )}
          </>
        }
      />
      <Panel title="Details">
        <DetailList
          items={[
            { term: 'Assignee', detail: <AgentName agentId={task.assignee_agent_id} /> },
            { term: 'From', detail: <AgentName agentId={task.delegator_agent_id} /> },
            {
              term: 'Part of',
              detail:
                parent === undefined ? (
                  'Nothing'
                ) : (
                  <Link to={`/tasks/${parent.id}`} className={LINK}>
                    {parent.title}
                  </Link>
                ),
            },
            {
              term: 'Repository',
              detail:
                repository === undefined
                  ? 'None'
                  : `${repository.name}${task.feature_branch === null ? '' : ` on ${task.feature_branch}`}`,
            },
            { term: 'Created', detail: <TimeStamp iso={task.created_at} isAbsolute /> },
            {
              term: 'Finished',
              detail:
                task.finished_at === null ? (
                  'Not yet'
                ) : (
                  <TimeStamp iso={task.finished_at} isAbsolute />
                ),
            },
          ]}
        />
      </Panel>
      <Panel title="Instructions">
        <p className="text-sm whitespace-pre-wrap">{task.instructions}</p>
      </Panel>
      {task.result !== null && (
        <Panel title="Result">
          <Markdown text={task.result} />
        </Panel>
      )}
      <Panel title="Subtasks" description="Parts of this task the assignee handed to its interns.">
        {subtasks.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">None.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {subtasks.map((subtask) => (
              <li
                key={subtask.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex flex-col">
                  <Link to={`/tasks/${subtask.id}`} className={LINK}>
                    {subtask.title}
                  </Link>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    <AgentName agentId={subtask.assignee_agent_id} isPlain />
                  </span>
                </span>
                <StatusBadge status={subtask.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ConfirmDialog
        isOpen={isCancelling}
        title={`Cancel ${task.title}?`}
        message="Its open subtasks are cancelled too. Work already done stays."
        confirmLabel="Cancel task"
        isBusy={cancel.isPending}
        error={cancel.error === null ? null : errorMessage(cancel.error)}
        onCancel={() => {
          setIsCancelling(false);
          cancel.reset();
        }}
        onConfirm={() => {
          cancel
            .submit(task.id)
            .then(() => setIsCancelling(false))
            .catch(() => undefined);
        }}
      />
    </>
  );
}
