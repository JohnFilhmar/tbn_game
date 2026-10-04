import type { Agent, Department } from '@tbn/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { AgentName } from '@/components/AgentName';
import { Button, buttonClasses } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { RenameDepartmentDialog } from './RenameDepartmentDialog';

function workingInterns(department: Department, agents: readonly Agent[]): Agent[] {
  return agents.filter(
    (agent) =>
      agent.department_id === department.id &&
      agent.level === 2 &&
      (agent.status === 'idle' || agent.status === 'working'),
  );
}

/** Each department in a paged table: its manager, its members and its interns, to rename. */
export function DepartmentsScreen() {
  const departments = useCollection(COLLECTIONS.departments);
  const agents = useCollection(COLLECTIONS.agents);
  const [renaming, setRenaming] = useState<Department | null>(null);
  const header = (
    <PageHeader
      title="Departments"
      description="A manager heads a department and hires interns into it. Rename one to fit how you work."
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
  const roster = agents.data;
  const columns: Column<Department>[] = [
    {
      header: 'Name',
      cell: (department) => <span className="font-medium">{department.name}</span>,
    },
    {
      header: 'Manager',
      cell: (department) =>
        department.manager_agent_id === null ? (
          'None'
        ) : (
          <AgentName agentId={department.manager_agent_id} />
        ),
    },
    { header: 'Members', cell: (department) => department.member_count },
    {
      header: 'Interns working',
      isWide: true,
      cell: (department) => {
        const interns = workingInterns(department, roster);
        return interns.length === 0 ? (
          'None'
        ) : (
          <span className="flex flex-wrap gap-x-3">
            {interns.map((intern) => (
              <AgentName key={intern.id} agentId={intern.id} />
            ))}
          </span>
        );
      },
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (department) => (
        <Button
          size="sm"
          onClick={() => setRenaming(department)}
          aria-label={`Rename ${department.name}`}
        >
          Rename
        </Button>
      ),
    },
  ];
  const sorted = [...departments.data].sort((left, right) => left.name.localeCompare(right.name));
  return (
    <>
      {header}
      <DataTable caption="Departments" columns={columns} rows={sorted} rowKey={(row) => row.id} />
      <RenameDepartmentDialog department={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}
