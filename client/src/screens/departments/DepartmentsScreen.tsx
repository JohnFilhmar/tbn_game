import { Link } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { buttonClasses } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

/** Each department with its manager and the interns working under it. */
export function DepartmentsScreen() {
  const departments = useCollection(COLLECTIONS.departments);
  const agents = useCollection(COLLECTIONS.agents);
  const header = (
    <PageHeader
      title="Departments"
      description="A manager heads the department named after its role and hires interns into it."
    />
  );
  if (departments.data === undefined || agents.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[departments, agents]} label="departments" />
      </>
    );
  }
  if (departments.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No departments yet"
          description="Recruit a manager to open the first one."
          action={
            <Link to="/agents/new" className={buttonClasses('primary')}>
              Recruit a manager
            </Link>
          }
        />
      </>
    );
  }
  const sorted = [...departments.data].sort((left, right) => left.name.localeCompare(right.name));
  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sorted.map((department) => {
          const interns = agents.data.filter(
            (agent) =>
              agent.department_id === department.id &&
              agent.level === 2 &&
              (agent.status === 'idle' || agent.status === 'working'),
          );
          return (
            <Panel
              key={department.id}
              title={department.name}
              description={`${department.member_count} member${department.member_count === 1 ? '' : 's'}`}
            >
              <p className="text-sm">
                <span className="text-slate-600 dark:text-slate-400">Manager: </span>
                {department.manager_agent_id === null ? (
                  'None'
                ) : (
                  <AgentName agentId={department.manager_agent_id} />
                )}
              </p>
              {interns.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No interns working now.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {interns.map((intern) => (
                    <li key={intern.id} className="flex items-center justify-between gap-2 text-sm">
                      <AgentName agentId={intern.id} />
                      <StatusBadge status={intern.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
