import type { Instruction } from '@tbn/contracts';
import { useState } from 'react';
import { AgentName } from '@/components/AgentName';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { Pager } from '@/components/Pager';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { errorMessage } from '@/lib/api/apiError';
import { dropRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { usePage } from '@/lib/ui/usePage';
import { InstructionForm } from './InstructionForm';

/** Instructions a page in each scope. */
const PAGE_SIZE = 10;

function ScopeList(props: {
  title: string;
  rows: readonly Instruction[];
  onEdit: (instruction: Instruction) => void;
  onDelete: (instruction: Instruction) => void;
}) {
  const paged = usePage(props.rows, PAGE_SIZE);
  return (
    <>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {paged.rows.map((instruction) => (
          <InstructionRow
            key={instruction.id}
            instruction={instruction}
            onEdit={() => props.onEdit(instruction)}
            onDelete={() => props.onDelete(instruction)}
          />
        ))}
      </ul>
      <Pager
        label={`${props.title} pages`}
        start={paged.start}
        end={paged.end}
        total={paged.total}
        page={paged.page}
        pages={paged.pages}
        onPrevious={paged.previous}
        onNext={paged.next}
      />
    </>
  );
}

function InstructionRow(props: {
  instruction: Instruction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { instruction } = props;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{instruction.title}</span>
          {!instruction.enabled && <StatusBadge status="cancelled" label="Disabled" />}
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {instruction.scope === 'role' && `Role ${instruction.role ?? ''}`}
            {instruction.scope === 'agent' && <AgentName agentId={instruction.agent_id} isPlain />}
          </span>
        </span>
        <span className="flex gap-2">
          <Button size="sm" onClick={props.onEdit}>
            Edit<span className="sr-only"> {instruction.title}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onDelete}>
            Delete<span className="sr-only"> {instruction.title}</span>
          </Button>
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
        {instruction.body}
      </p>
    </li>
  );
}

const SCOPES = [
  { scope: 'global', title: 'Every agent' },
  { scope: 'role', title: 'By role' },
  { scope: 'agent', title: 'Single agents' },
] as const;

/** Standing rules injected into agents' system prompts, by how widely they apply. */
export function InstructionsScreen() {
  const instructions = useCollection(COLLECTIONS.instructions);
  const [editing, setEditing] = useState<Instruction | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Instruction | null>(null);
  const remove = useCommand(
    (api, id: string, commandId) =>
      api.sendNoContent('DELETE', `/instructions/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.instructions, id),
  );
  const header = (
    <PageHeader
      title="Instructions"
      description="Rules every agent, a role or one agent follows. Only you change them; nothing an agent reads can."
      actions={
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add an instruction
        </Button>
      }
    />
  );
  const dialogs = (
    <>
      <Dialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing === 'new' || editing === null ? 'Add an instruction' : `Edit ${editing.title}`
        }
      >
        {editing !== null && (
          <InstructionForm
            instruction={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete ${deleting?.title ?? 'the instruction'}?`}
        message="Agents stop following it from their next turn."
        confirmLabel="Delete"
        isBusy={remove.isPending}
        error={remove.error === null ? null : errorMessage(remove.error)}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (deleting === null) return;
          remove
            .submit(deleting.id)
            .then(() => setDeleting(null))
            .catch(() => undefined);
        }}
      />
    </>
  );
  if (instructions.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[instructions]} label="instructions" />
        {dialogs}
      </>
    );
  }
  return (
    <>
      {header}
      {instructions.data.length === 0 ? (
        <EmptyState
          title="No instructions yet"
          description="Add a rule such as how reports should read or what never to do."
        />
      ) : (
        SCOPES.map(({ scope, title }) => {
          const rows = instructions.data
            .filter((instruction) => instruction.scope === scope)
            .sort((left, right) => left.position - right.position);
          if (rows.length === 0) return null;
          return (
            <Panel key={scope} title={title}>
              <ScopeList title={title} rows={rows} onEdit={setEditing} onDelete={setDeleting} />
            </Panel>
          );
        })
      )}
      {dialogs}
    </>
  );
}
