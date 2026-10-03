import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, buttonClasses } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormError } from '@/components/FormError';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { errorMessage } from '@/lib/api/apiError';
import { dropRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { saveBlob } from '@/lib/ui/saveBlob';
import { useApi } from '@/providers/SessionProvider';
import { AttachmentsEditor } from './AttachmentsEditor';
import { SkillForm } from './SkillForm';

/** One skill: its text, who it is attached to, export and delete. */
export function SkillScreen() {
  const { skillId = '' } = useParams();
  const api = useApi();
  const skills = useCollection(COLLECTIONS.skills);
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const remove = useCommand(
    (client, id: string, commandId) =>
      client.sendNoContent('DELETE', `/skills/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.skills, id),
  );
  if (skills.data === undefined) return <QueryStatus queries={[skills]} label="skill" />;
  const skill = skills.data.find((row) => row.id === skillId);
  if (skill === undefined) {
    return (
      <EmptyState
        title="This skill does not exist"
        action={
          <Link to="/skills" className={buttonClasses('secondary')}>
            Back to the skills
          </Link>
        }
      />
    );
  }
  const exportFile = (): void => {
    setExportError(null);
    api
      .getBlob(`/skills/${skill.id}/export`)
      .then((blob) => saveBlob(blob, `${skill.name}.md`))
      .catch((caught: unknown) => setExportError(errorMessage(caught)));
  };
  return (
    <>
      <PageHeader
        back={{ to: '/skills', label: 'Skills' }}
        title={skill.name}
        description={skill.description}
        actions={
          <>
            <Button onClick={exportFile}>Export SKILL.md</Button>
            <Button variant="danger" onClick={() => setIsDeleting(true)}>
              Delete
            </Button>
          </>
        }
      />
      <FormError message={exportError} />
      <Panel title="Skill">
        <SkillForm key={skill.id} skill={skill} onDone={() => undefined} />
      </Panel>
      <AttachmentsEditor key={skill.updated_at} skill={skill} />
      <ConfirmDialog
        isOpen={isDeleting}
        title={`Delete ${skill.name}?`}
        message="Agents stop seeing it from their next turn."
        confirmLabel="Delete"
        isBusy={remove.isPending}
        error={remove.error === null ? null : errorMessage(remove.error)}
        onCancel={() => {
          setIsDeleting(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove
            .submit(skill.id)
            .then(() => navigate('/skills'))
            .catch(() => undefined);
        }}
      />
    </>
  );
}
