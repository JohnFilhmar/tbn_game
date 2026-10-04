import { OwnerMessageSchema, TaskSchema, TranscriptEntrySchema, type Task } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { TextAreaField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { putRow, putTranscriptEntry } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { COMMAND_HELP, parseCommand } from './commands';

/** Props of `MessageBox`. */
export interface MessageBoxProps {
  agentId: string;
  agentName: string;
  /** Why the agent cannot take messages, if it cannot. */
  closedReason: string | null;
  /** Takes the focus when it appears, as the world's conversation panel wants. */
  isAutoFocused?: boolean;
  /** Called with the task a `/task` command gave the agent, so the world can show it taken. */
  onTaskGiven?: (task: Task) => void;
}

/**
 * Where the owner writes to an agent. Ctrl or Cmd with Enter sends. A line starting with `/` is a
 * command and never reaches the model: `/task` gives the agent a task, `/help` lists the commands.
 */
export function MessageBox({
  agentId,
  agentName,
  closedReason,
  isAutoFocused = false,
  onTaskGiven,
}: MessageBoxProps) {
  const api = useApi();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const form = useForm({
    initial: { text: '' },
    schema: OwnerMessageSchema,
    toInput: (draft) => ({ text: draft.text.trim() }),
    onSubmit: async (body, commandId) => {
      const command = parseCommand(body.text);
      setNotice('');
      if (command.kind === 'unknown') {
        throw new Error(`/${command.name} is not a command. /help lists them.`);
      }
      if (command.kind === 'help') {
        setNotice(COMMAND_HELP);
        form.reset({ text: '' });
        return;
      }
      if (command.kind === 'task') {
        const task = await api.send('POST', '/tasks', TaskSchema, {
          body: {
            title: command.title,
            instructions: command.instructions,
            assignee_agent_id: agentId,
          },
          commandId,
        });
        putRow(client, COLLECTIONS.tasks, task);
        setNotice(`${agentName} has a new task: ${task.title}`);
        onTaskGiven?.(task);
        form.reset({ text: '' });
        return;
      }
      const entry = await api.send('POST', `/agents/${agentId}/messages`, TranscriptEntrySchema, {
        body,
        commandId,
      });
      putTranscriptEntry(client, entry);
      form.reset({ text: '' });
    },
  });
  return (
    <form className="flex flex-col gap-2" noValidate onSubmit={form.handleSubmit}>
      <TextAreaField
        label={`Message to ${agentName}`}
        hint={
          closedReason ?? 'Ctrl or Cmd with Enter sends. /task gives a task; /help lists commands.'
        }
        rows={3}
        // The owner opened the conversation to write to the agent.
        autoFocus={isAutoFocused}
        disabled={closedReason !== null}
        value={form.draft.text}
        onChange={(value) => form.setField('text', value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            form.handleSubmit(event);
          }
        }}
        error={form.errors['text']}
      />
      <FormError message={form.errors['']} />
      <p
        role="status"
        className={notice === '' ? 'sr-only' : 'text-sm text-slate-600 dark:text-slate-300'}
      >
        {notice}
      </p>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          isBusy={form.isSubmitting}
          disabled={closedReason !== null}
        >
          Send
        </Button>
      </div>
    </form>
  );
}
