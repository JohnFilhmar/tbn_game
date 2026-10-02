import { ImportSkillSchema, SkillSchema, type Skill } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { TextAreaField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { newCommandId } from '@/lib/api/apiClient';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Imports a `SKILL.md`: pasted, or read from a file the owner picks. */
export function ImportSkillForm({ onDone }: { onDone: (skill: Skill | null) => void }) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: { markdown: '' },
    schema: ImportSkillSchema,
    toInput: (draft) => ({ markdown: draft.markdown }),
    onSubmit: async (body) => {
      const skill = await api.send('POST', '/skills/import', SkillSchema, {
        body,
        commandId: newCommandId(),
      });
      putRow(client, COLLECTIONS.skills, skill);
      onDone(skill);
    },
  });
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <div className="flex flex-col gap-1">
        <label htmlFor="skill-file" className="text-sm font-medium">
          SKILL.md file
        </label>
        <input
          id="skill-file"
          type="file"
          accept=".md,text/markdown,text/plain"
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void file.text().then((text) => form.setField('markdown', text));
            }
          }}
        />
      </div>
      <TextAreaField
        label="Or paste it"
        hint="Frontmatter with name and description, then the body."
        rows={12}
        isCode
        value={form.draft.markdown}
        onChange={(value) => form.setField('markdown', value)}
        error={form.errors['markdown']}
      />
      <FormError message={form.errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone(null)}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          Import
        </Button>
      </div>
    </form>
  );
}
