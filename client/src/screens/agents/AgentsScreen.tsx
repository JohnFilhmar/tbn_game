import type { Agent, Department, Task } from '@tbn/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { ChipGroup } from '@/components/Tabs';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

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

function AgentRow({ agent, tasks }: { agent: Agent; tasks: readonly Task[] }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col">
        <Link
          to={`/agents/${agent.id}`}
          className="font-medium text-teal-800 hover:underline dark:text-teal-300"
        >
          {agent.name}
        </Link>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {agent.level === 1 ? 'Manager' : 'Intern'} · {agent.role} · {agent.primary_model}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm text-slate-700 dark:text-slate-300">
          {currentWork(agent, tasks)}
        </span>
        <StatusBadge status={agent.status} />
      </div>
    </li>
  );
}

function DepartmentRoster(props: {
  department: Department;
  agents: Agent[];
  tasks: readonly Task[];
}) {
  const { department, agents, tasks } = props;
  const sorted = [...agents].sort(
    (left, right) => left.level - right.level || left.name.localeCompare(right.name),
  );
  return (
    <Panel title={department.name}>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {sorted.map((agent) => (
          <AgentRow key={agent.id} agent={agent} tasks={tasks} />
        ))}
      </ul>
    </Panel>
  );
}

/** Every agent by department, with what each is doing now. */
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

  const shown = agents.data.filter((agent) => matches(agent, filter));
  const groups = departments.data
    .map((department) => ({
      department,
      members: shown.filter((agent) => agent.department_id === department.id),
    }))
    .filter((group) => group.members.length > 0)
    .sort((left, right) => left.department.name.localeCompare(right.department.name));
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
      {groups.length === 0 ? (
        <EmptyState title="No agent matches" description="Choose another filter above." />
      ) : (
        groups.map((group) => (
          <DepartmentRoster
            key={group.department.id}
            department={group.department}
            agents={group.members}
            tasks={tasks.data}
          />
        ))
      )}
    </>
  );
}
