import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { ImportSkillForm } from './ImportSkillForm';
import { SkillForm } from './SkillForm';

/** Skills: instructions agents load when the work calls for them, attached to roles or agents. */
export function SkillsScreen() {
  const skills = useCollection(COLLECTIONS.skills);
  const navigate = useNavigate();
  const [mode, setMode] = useState<'write' | 'import' | null>(null);
  const done = (skillId: string | null): void => {
    setMode(null);
    if (skillId !== null) void navigate(`/skills/${skillId}`);
  };
  const header = (
    <PageHeader
      title="Skills"
      description="Each skill is a SKILL.md: one line in the prompt of the agents it is attached to, and a body they load on demand."
      actions={
        <>
          <Button onClick={() => setMode('import')}>Import SKILL.md</Button>
          <Button variant="primary" onClick={() => setMode('write')}>
            Write a skill
          </Button>
        </>
      }
    />
  );
  const dialog = (
    <Dialog
      isOpen={mode !== null}
      onClose={() => setMode(null)}
      title={mode === 'import' ? 'Import a skill' : 'Write a skill'}
    >
      {mode === 'write' && (
        <SkillForm skill={undefined} onDone={(skill) => done(skill?.id ?? null)} />
      )}
      {mode === 'import' && <ImportSkillForm onDone={(skill) => done(skill?.id ?? null)} />}
    </Dialog>
  );
  if (skills.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[skills]} label="skills" />
        {dialog}
      </>
    );
  }
  return (
    <>
      {header}
      {skills.data.length === 0 ? (
        <EmptyState
          title="No skills yet"
          description="Write one, or import a SKILL.md, then attach it to a role or an agent."
        />
      ) : (
        <DataTable
          caption="Skills"
          rows={[...skills.data].sort((left, right) => left.name.localeCompare(right.name))}
          rowKey={(skill) => skill.id}
          columns={[
            {
              header: 'Name',
              cell: (skill) => (
                <Link
                  to={`/skills/${skill.id}`}
                  className="font-medium text-teal-800 hover:underline dark:text-teal-300"
                >
                  {skill.name}
                </Link>
              ),
            },
            { header: 'Description', cell: (skill) => skill.description },
            {
              header: 'Attached to',
              isWide: true,
              cell: (skill) =>
                skill.attachments.length === 0 ? 'Nobody' : `${skill.attachments.length}`,
            },
          ]}
        />
      )}
      {dialog}
    </>
  );
}
