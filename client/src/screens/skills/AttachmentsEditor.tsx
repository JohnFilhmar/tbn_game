import { SkillSchema, type Skill, type SkillAttachment } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { AgentName } from '@/components/AgentName';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/fields/SelectField';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { Panel } from '@/components/Panel';
import { newCommandId } from '@/lib/api/apiClient';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useApi } from '@/providers/SessionProvider';

function keyOf(attachment: SkillAttachment): string {
  return attachment.target_type === 'role'
    ? `role:${attachment.role}`
    : `agent:${attachment.agent_id}`;
}

/** Who sees a skill: every agent with a role, or single agents. Saving replaces the whole list. */
export function AttachmentsEditor({ skill }: { skill: Skill }) {
  const api = useApi();
  const client = useQueryClient();
  const agents = useCollection(COLLECTIONS.agents);
  const [attachments, setAttachments] = useState<SkillAttachment[]>(skill.attachments);
  const rolesId = useId();
  const [role, setRole] = useState('');
  const [agentId, setAgentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const roles = [...new Set((agents.data ?? []).map((agent) => agent.role))].sort();
  const add = (attachment: SkillAttachment): void => {
    if (attachments.some((current) => keyOf(current) === keyOf(attachment))) return;
    setAttachments([...attachments, attachment]);
  };
  const save = (): void => {
    setIsSaving(true);
    setError(null);
    api
      .send('PUT', `/skills/${skill.id}/attachments`, SkillSchema, {
        body: { attachments },
        commandId: newCommandId(),
      })
      .then((saved) => putRow(client, COLLECTIONS.skills, saved))
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setIsSaving(false));
  };
  return (
    <Panel
      title="Attached to"
      description="Agents with an attached skill see its description in their prompt."
    >
      {attachments.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nobody yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li key={keyOf(attachment)} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {attachment.target_type === 'role' ? (
                  <>Every agent with the role {attachment.role}</>
                ) : (
                  <AgentName agentId={attachment.agent_id} />
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setAttachments(
                    attachments.filter((current) => keyOf(current) !== keyOf(attachment)),
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex items-end gap-2">
          <TextField
            label="Role"
            className="flex-1"
            list={rolesId}
            value={role}
            onChange={setRole}
          />
          <datalist id={rolesId}>
            {roles.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button
            size="sm"
            disabled={role.trim().length === 0}
            onClick={() => {
              add({ target_type: 'role', role: role.trim() });
              setRole('');
            }}
          >
            Add role
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <SelectField
            label="Agent"
            className="flex-1"
            placeholder="Choose an agent"
            value={agentId}
            options={(agents.data ?? [])
              .filter((agent) => agent.status === 'idle' || agent.status === 'working')
              .map((agent) => ({ value: agent.id, label: agent.name }))}
            onChange={setAgentId}
          />
          <Button
            size="sm"
            disabled={agentId.length === 0}
            onClick={() => {
              add({ target_type: 'agent', agent_id: agentId });
              setAgentId('');
            }}
          >
            Add agent
          </Button>
        </div>
      </div>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button variant="primary" isBusy={isSaving} onClick={save}>
          Save attachments
        </Button>
      </div>
    </Panel>
  );
}
