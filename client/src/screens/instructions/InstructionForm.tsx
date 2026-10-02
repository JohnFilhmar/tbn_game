import {
  CreateInstructionSchema,
  InstructionSchema,
  InstructionScopeSchema,
  UpdateInstructionSchema,
  type Instruction,
  type InstructionScope,
} from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { Button } from '@/components/Button';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { SelectField } from '@/components/fields/SelectField';
import { TextAreaField, TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { newCommandId } from '@/lib/api/apiClient';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { numberOrNull } from '@/lib/forms/numbers';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

const SCOPE_LABELS: Record<InstructionScope, string> = {
  global: 'Every agent',
  role: 'Every agent with a role',
  agent: 'One agent',
};

/** Props of `InstructionForm`. */
export interface InstructionFormProps {
  instruction: Instruction | undefined;
  onDone: () => void;
}

/** Writes a standing rule for every agent, a role or one agent. */
export function InstructionForm({ instruction, onDone }: InstructionFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const agents = useCollection(COLLECTIONS.agents);
  const rolesId = useId();
  const roles = [...new Set((agents.data ?? []).map((agent) => agent.role))].sort();
  const form = useForm({
    initial: {
      scope: instruction?.scope ?? 'global',
      role: instruction?.role ?? '',
      agent_id: instruction?.agent_id ?? '',
      title: instruction?.title ?? '',
      body: instruction?.body ?? '',
      position: String(instruction?.position ?? 0),
      enabled: instruction?.enabled ?? true,
    },
    schema: instruction === undefined ? CreateInstructionSchema : UpdateInstructionSchema,
    toInput: (draft) => ({
      scope: draft.scope,
      role: draft.scope === 'role' ? draft.role.trim() : null,
      agent_id: draft.scope === 'agent' ? draft.agent_id : null,
      title: draft.title.trim(),
      body: draft.body.trim(),
      position: numberOrNull(draft.position) ?? 0,
      enabled: draft.enabled,
    }),
    onSubmit: async (body) => {
      const saved =
        instruction === undefined
          ? await api.send('POST', '/instructions', InstructionSchema, {
              body,
              commandId: newCommandId(),
            })
          : await api.send('PATCH', `/instructions/${instruction.id}`, InstructionSchema, {
              body,
              commandId: newCommandId(),
            });
      putRow(client, COLLECTIONS.instructions, saved);
      onDone();
    },
  });
  const { draft, setField, errors } = form;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label="Applies to"
          value={draft.scope}
          options={InstructionScopeSchema.options.map((value) => ({
            value,
            label: SCOPE_LABELS[value],
          }))}
          onChange={(value) => {
            const scope = InstructionScopeSchema.safeParse(value);
            if (scope.success) setField('scope', scope.data);
          }}
          error={errors['scope']}
        />
        {draft.scope === 'role' && (
          <>
            <TextField
              label="Role"
              list={rolesId}
              value={draft.role}
              onChange={(value) => setField('role', value)}
              error={errors['role']}
            />
            <datalist id={rolesId}>
              {roles.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        )}
        {draft.scope === 'agent' && (
          <SelectField
            label="Agent"
            placeholder="Choose an agent"
            value={draft.agent_id}
            options={(agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.name }))}
            onChange={(value) => setField('agent_id', value)}
            error={errors['agent_id']}
          />
        )}
      </div>
      <TextField
        label="Title"
        value={draft.title}
        onChange={(value) => setField('title', value)}
        error={errors['title']}
      />
      <TextAreaField
        label="Instruction"
        rows={6}
        value={draft.body}
        onChange={(value) => setField('body', value)}
        error={errors['body']}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="Position"
          inputMode="numeric"
          hint="Lower comes first in the prompt."
          value={draft.position}
          onChange={(value) => setField('position', value)}
          error={errors['position']}
        />
        <CheckboxField
          label="Enabled"
          checked={draft.enabled}
          onChange={(value) => setField('enabled', value)}
        />
      </div>
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          {instruction === undefined ? 'Add instruction' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
