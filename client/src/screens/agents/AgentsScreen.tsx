import type { Agent, Task } from '@tbn/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { ChipGroup } from '@/components/Tabs';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { RehireButton } from './RehireButton';

type RosterFilter = 'live' | 'working' | 'former';

const LIVE = new Set(['idle', 'working']);

function matches(agent: Agent, filter: RosterFilter): boolean {
  if (filter === 'working') return agent.status === 'working';
  if (filter === 'live') return LIVE.has(agent.status);
  return !LIVE.has(agent.status);
}

/** What an agent is doing: its task in progress, or how many wait for it. */
function currentWork(agent: Agent, tasks: readonly Task[]): string {
  const own = tasks.filter((task) => task.assignee_agent_id === agent.id);
  const active = own.find((task) => task.status === 'in_progress');
  if (active !== undefined) return active.title;
  const waiting = own.filter((task) => task.status === 'queued').length;
  if (waiting > 0) return `${waiting} task${waiting === 1 ? '' : 's'} queued`;
  return 'No open task';
}

/** The table's columns, with a Rehire button on a former agent. */
function columnsOf(
  tasks: readonly Task[],
  departmentName: (id: string) => string,
): Column<Agent>[] {
  return [
    {
      header: 'Name',
      cell: (agent) => (
        <Link
          to={`/agents/${agent.id}`}
          className="font-medium text-teal-800 hover:underline dark:text-teal-300"
        >
          {agent.name}
        </Link>
      ),
    },
    {
      header: 'Role',
      cell: (agent) => `${agent.level === 1 ? 'Manager' : 'Intern'} · ${agent.role}`,
    },
    { header: 'Department', cell: (agent) => departmentName(agent.department_id), isWide: true },
    { header: 'Doing', cell: (agent) => currentWork(agent, tasks), isWide: true },
    { header: 'Status', cell: (agent) => <StatusBadge status={agent.status} /> },
    {
      header: 'Actions',
      cell: (agent) => (LIVE.has(agent.status) ? null : <RehireButton agent={agent} size="sm" />),
      className: 'text-right',
    },
  ];
}

/** Every agent in one paged table, by department, with what each is doing now. */
export function AgentsScreen() {
  const agents = useCollection(COLLECTIONS.agents);
  const departments = useCollection(COLLECTIONS.departments);
  const tasks = useCollection(COLLECTIONS.tasks);
  const [filter, setFilter] = useState<RosterFilter>('live');

  const header = (
    <PageHeader
      title="Agents"
      description="Your managers and their interns. Open one to chat, change its tools or follow its runs."
      actions={
        <Link to="/agents/new" className={buttonClasses('primary')}>
          Recruit
        </Link>
      }
    />
  );
  if (agents.data === undefined || departments.data === undefined || tasks.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[agents, departments, tasks]} label="agents" />
      </>
    );
  }
  if (agents.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No one works here yet"
          description="Recruit a manager to open the first department."
          action={
            <Link to="/agents/new" className={buttonClasses('primary')}>
              Recruit a manager
            </Link>
          }
        />
      </>
    );
  }

  const departmentById = new Map(departments.data.map((department) => [department.id, department]));
  const departmentName = (id: string): string => departmentById.get(id)?.name ?? '';
  const shown = agents.data
    .filter((agent) => matches(agent, filter))
    .sort(
      (left, right) =>
        departmentName(left.department_id).localeCompare(departmentName(right.department_id)) ||
        left.level - right.level ||
        left.name.localeCompare(right.name),
    );
  const count = (value: RosterFilter): number =>
    agents.data.filter((agent) => matches(agent, value)).length;

  return (
    <>
      {header}
      <ChipGroup
        label="Show"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'live', label: 'Live', count: count('live') },
          { value: 'working', label: 'Working now', count: count('working') },
          { value: 'former', label: 'Dismissed or ended', count: count('former') },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState title="No agent matches" description="Choose another filter above." />
      ) : (
        <DataTable
          caption="Agents"
          columns={columnsOf(tasks.data, departmentName)}
          rows={shown}
          rowKey={(agent) => agent.id}
          searchText={(row) => `${row.name} ${row.role} ${row.job_description} ${row.status}`}
        />
      )}
    </>
  );
}
