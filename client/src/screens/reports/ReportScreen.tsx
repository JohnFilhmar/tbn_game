import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { Button, buttonClasses } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { TimeStamp } from '@/components/TimeStamp';
import { errorMessage } from '@/lib/api/apiError';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { saveBlob } from '@/lib/ui/saveBlob';
import { useApi } from '@/providers/SessionProvider';

/** One report, rendered, with a download of its Markdown file. */
export function ReportScreen() {
  const { reportId = '' } = useParams();
  const api = useApi();
  const reports = useCollection(COLLECTIONS.reports);
  const tasks = useCollection(COLLECTIONS.tasks);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (reports.data === undefined) return <QueryStatus queries={[reports]} label="report" />;
  const report = reports.data.find((row) => row.id === reportId);
  if (report === undefined) {
    return (
      <EmptyState
        title="This report does not exist"
        action={
          <Link to="/reports" className={buttonClasses('secondary')}>
            Back to the reports
          </Link>
        }
      />
    );
  }
  const task = tasks.data?.find((row) => row.id === report.task_id);
  const download = (): void => {
    setIsDownloading(true);
    setError(null);
    api
      .getBlob(`/reports/${report.id}/download`)
      .then((blob) => saveBlob(blob, `${task?.title ?? 'report'}.md`))
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setIsDownloading(false));
  };
  return (
    <>
      <PageHeader
        back={{ to: '/reports', label: 'Reports' }}
        title={task?.title ?? 'Report'}
        description={
          <>
            By <AgentName agentId={report.agent_id} />,{' '}
            <TimeStamp iso={report.created_at} isAbsolute />
          </>
        }
        actions={
          <>
            {task !== undefined && (
              <Link to={`/tasks/${task.id}`} className={buttonClasses('secondary')}>
                Open the task
              </Link>
            )}
            <Button isBusy={isDownloading} onClick={download}>
              Download .md
            </Button>
          </>
        }
      />
      <FormError message={error} />
      <Panel>
        <article aria-label="Report">
          <Markdown text={report.body_md} />
        </article>
      </Panel>
    </>
  );
}
