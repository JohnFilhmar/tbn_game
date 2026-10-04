import { AgentSchema } from '@tbn/contracts';
import { useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { Button, buttonClasses } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TabLinks } from '@/components/Tabs';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { RehireButton } from '../RehireButton';

/** One agent: its header with dismiss or rehire, and the chat, profile, tools, runs and tasks as tabs. */
export function AgentScreen() {
  const { agentId = '' } = useParams();
  const agents = useCollection(COLLECTIONS.agents);
  const departments = useCollection(COLLECTIONS.departments);
  const [isConfirming, setIsConfirming] = useState(false);
  const dismiss = useCommand(
    (api, id: string, commandId) =>
      api.send('POST', `/agents/${id}/dismiss`, AgentSchema, { commandId }),
    (cache, agent) => putRow(cache, COLLECTIONS.agents, agent),
  );

  if (agents.data === undefined) return <QueryStatus queries={[agents]} label="agent" />;
  const agent = agents.data.find((row) => row.id === agentId);
  if (agent === undefined) {
    return (
      <EmptyState
        title="This agent does not exist"
        description="It may belong to another account, or the address is mistyped."
        action={
          <Link to="/agents" className={buttonClasses('secondary')}>
            Back to the agents
          </Link>
        }
      />
    );
  }
  const department = departments.data?.find((row) => row.id === agent.department_id);
  const isLive = agent.status === 'idle' || agent.status === 'working';
  const base = `/agents/${agent.id}`;

  return (
    <>
      <PageHeader
        back={{ to: '/agents', label: 'Agents' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {agent.name}
            <StatusBadge status={agent.status} />
          </span>
        }
        description={[
          agent.level === 1 ? 'Manager' : 'Intern',
          agent.role,
          department !== undefined && department.name !== agent.role
            ? `in ${department.name}`
            : null,
          agent.primary_model,
        ]
          .filter((part) => part !== null)
          .join(' · ')}
        actions={
          isLive ? (
            <Button variant="danger" onClick={() => setIsConfirming(true)}>
              Dismiss
            </Button>
          ) : (
            <RehireButton agent={agent} />
          )
        }
      />
      <TabLinks
        label="Agent sections"
        tabs={[
          { to: base, label: 'Chat', end: true },
          { to: `${base}/profile`, label: 'Profile' },
          { to: `${base}/tools`, label: 'Tools' },
          { to: `${base}/runs`, label: 'Runs' },
          { to: `${base}/tasks`, label: 'Tasks' },
        ]}
      />
      <Outlet context={agent} />
      <ConfirmDialog
        isOpen={isConfirming}
        title={`Dismiss ${agent.name}?`}
        message="Its queued tasks are cancelled and it takes no new work. Its transcript, tasks and reports stay."
        confirmLabel="Dismiss"
        isBusy={dismiss.isPending}
        error={dismiss.error === null ? null : errorMessage(dismiss.error)}
        onCancel={() => {
          setIsConfirming(false);
          dismiss.reset();
        }}
        onConfirm={() => {
          dismiss
            .submit(agent.id)
            .then(() => setIsConfirming(false))
            .catch(() => undefined);
        }}
      />
    </>
  );
}
