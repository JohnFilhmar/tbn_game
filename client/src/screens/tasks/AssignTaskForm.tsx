import { CreateTaskSchema, TaskSchema } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/fields/SelectField';
import { TextAreaField, TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Props of `AssignTaskForm`. */
export interface AssignTaskFormProps {
  /** The agent chosen when the form opens, if any. */
  assigneeId: string;
  onDone: (taskId: string | null) => void;
}

/** Gives a live agent a task, optionally on a repository. */
export function AssignTaskForm({ assigneeId, onDone }: AssignTaskFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const agents = useCollection(COLLECTIONS.agents);
  const repositories = useCollection(COLLECTIONS.repositories);
  const live = (agents.data ?? []).filter(
    (agent) => agent.status === 'idle' || agent.status === 'working',
  );
  const form = useForm({
    initial: { title: '', instructions: '', assignee_agent_id: assigneeId, repository_id: '' },
    schema: CreateTaskSchema,
    toInput: (draft) => ({
      title: draft.title.trim(),
      instructions: draft.instructions.trim(),
      assignee_agent_id: draft.assignee_agent_id,
      repository_id: draft.repository_id.length > 0 ? draft.repository_id : null,
    }),
    onSubmit: async (body, commandId) => {
      const task = await api.send('POST', '/tasks', TaskSchema, {
        body,
        commandId,
      });
      putRow(client, COLLECTIONS.tasks, task);
      onDone(task.id);
    },
  });
  const { draft, setField, errors } = form;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <TextField
        label="Title"
        value={draft.title}
        onChange={(value) => setField('title', value)}
        error={errors['title']}
      />
      <TextAreaField
        label="Instructions"
        rows={6}
        hint="What to do and what a good result looks like. The agent reports back in Markdown."
        value={draft.instructions}
        onChange={(value) => setField('instructions', value)}
        error={errors['instructions']}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label="Assignee"
          placeholder={live.length === 0 ? 'Recruit an agent first' : 'Choose an agent'}
          value={draft.assignee_agent_id}
          options={live.map((agent) => ({
            value: agent.id,
            label: `${agent.name} (${agent.level === 1 ? 'manager' : 'intern'}, ${agent.role})`,
          }))}
          onChange={(value) => setField('assignee_agent_id', value)}
          error={errors['assignee_agent_id']}
        />
        <SelectField
          label="Repository"
          placeholder="None"
          value={draft.repository_id}
          options={(repositories.data ?? []).map((repository) => ({
            value: repository.id,
            label: repository.name,
          }))}
          onChange={(value) => setField('repository_id', value)}
          error={errors['repository_id']}
        />
      </div>
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone(null)}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          Assign
        </Button>
      </div>
    </form>
  );
}
