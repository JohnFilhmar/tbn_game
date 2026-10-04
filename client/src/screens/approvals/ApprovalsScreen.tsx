import type { Agent, Approval, Task } from '@tbn/contracts';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { ChipGroup } from '@/components/Tabs';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { byId, newestFirst, oldestFirst } from '@/lib/data/rows';
import { usePage } from '@/lib/ui/usePage';
import { ApprovalCard } from './ApprovalCard';

/** Approval cards a page. */
const PAGE_SIZE = 10;

function ApprovalPages(props: {
  approvals: readonly Approval[];
  agentById: ReadonlyMap<string, Agent>;
  taskById: ReadonlyMap<string, Task>;
}) {
  const { approvals, agentById, taskById } = props;
  const paged = usePage(approvals, PAGE_SIZE);
  return (
    <div className="flex flex-col gap-4">
      {paged.rows.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          agentName={agentById.get(approval.agent_id)?.name ?? 'An agent'}
          taskTitle={approval.task_id === null ? undefined : taskById.get(approval.task_id)?.title}
        />
      ))}
      <Pager
        label="Approvals pages"
        start={paged.start}
        end={paged.end}
        total={paged.total}
        page={paged.page}
        pages={paged.pages}
        onPrevious={paged.previous}
        onNext={paged.next}
      />
    </div>
  );
}

type ApprovalFilter = 'pending' | 'decided';

/** The approval inbox: calls waiting for the owner, oldest first, and the ones already decided. */
export function ApprovalsScreen() {
  const approvals = useCollection(COLLECTIONS.approvals);
  const tasks = useCollection(COLLECTIONS.tasks);
  const agents = useCollection(COLLECTIONS.agents);
  const [filter, setFilter] = useState<ApprovalFilter>('pending');
  const header = (
    <PageHeader
      title="Approvals"
      description="Tool calls that wait for you: a tool whose policy asks first, or any outward call of a run that read web or plugin content."
    />
  );
  if (approvals.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[approvals]} label="approvals" />
      </>
    );
  }
  const pending = oldestFirst(
    approvals.data.filter((approval) => approval.status === 'pending'),
    (approval) => approval.created_at,
  );
  const decided = newestFirst(
    approvals.data.filter((approval) => approval.status !== 'pending'),
    (approval) => approval.decided_at ?? approval.created_at,
  );
  const shown = filter === 'pending' ? pending : decided;
  const taskById = byId(tasks.data);
  const agentById = byId(agents.data);
  return (
    <>
      {header}
      <ChipGroup
        label="Show"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'pending', label: 'Waiting', count: pending.length },
          { value: 'decided', label: 'Decided', count: decided.length },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'Nothing waits for you' : 'Nothing decided yet'}
          description={
            filter === 'pending'
              ? 'When an agent needs your yes, it shows here and the launcher counts it.'
              : undefined
          }
        />
      ) : (
        <ApprovalPages key={filter} approvals={shown} agentById={agentById} taskById={taskById} />
      )}
    </>
  );
}
