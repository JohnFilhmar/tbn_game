import {
  CreateSkillSchema,
  MOST_SKILL_DESCRIPTION_CHARS,
  SkillSchema,
  UpdateSkillSchema,
  type Skill,
} from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { TextAreaField, TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Props of `SkillForm`. */
export interface SkillFormProps {
  skill: Skill | undefined;
  onDone: (skill: Skill | null) => void;
}

/** Writes a skill: its name, the one line agents see, and the body they load on demand. */
export function SkillForm({ skill, onDone }: SkillFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: {
      name: skill?.name ?? '',
      description: skill?.description ?? '',
      body: skill?.body ?? '',
    },
    schema: skill === undefined ? CreateSkillSchema : UpdateSkillSchema,
    toInput: (draft) => ({
      name: draft.name.trim(),
      description: draft.description.trim(),
      body: draft.body.trim(),
    }),
    onSubmit: async (body, commandId) => {
      const saved =
        skill === undefined
          ? await api.send('POST', '/skills', SkillSchema, { body, commandId })
          : await api.send('PATCH', `/skills/${skill.id}`, SkillSchema, {
              body,
              commandId,
            });
      putRow(client, COLLECTIONS.skills, saved);
      onDone(saved);
    },
  });
  const { draft, setField, errors } = form;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <TextField
        label="Name"
        value={draft.name}
        onChange={(value) => setField('name', value)}
        error={errors['name']}
      />
      <TextAreaField
        label="Description"
        rows={3}
        hint={`One paragraph, ${draft.description.length} of ${MOST_SKILL_DESCRIPTION_CHARS} characters. Agents see it in every prompt and load the body when it fits the work.`}
        value={draft.description}
        onChange={(value) => setField('description', value)}
        error={errors['description']}
      />
      <TextAreaField
        label="Body"
        rows={12}
        isCode
        value={draft.body}
        onChange={(value) => setField('body', value)}
        error={errors['body']}
      />
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone(null)}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          {skill === undefined ? 'Add skill' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
