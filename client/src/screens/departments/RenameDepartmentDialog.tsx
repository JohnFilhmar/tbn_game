import { DepartmentSchema, UpdateDepartmentSchema, type Department } from '@tbn/contracts';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';

/** Props of `RenameDepartmentDialog`. */
export interface RenameDepartmentDialogProps {
  /** The department to rename, or null while the dialog is shut. */
  department: Department | null;
  onClose: () => void;
}

function RenameForm({ department, onClose }: { department: Department; onClose: () => void }) {
  const [name, setName] = useState(department.name);
  const rename = useCommand(
    (api, next: string, commandId) =>
      api.send('PATCH', `/departments/${department.id}`, DepartmentSchema, {
        body: { name: next },
        commandId,
      }),
    (cache, saved) => putRow(cache, COLLECTIONS.departments, saved),
  );
  const parsed = UpdateDepartmentSchema.safeParse({ name });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!parsed.success) return;
        rename
          .submit(parsed.data.name)
          .then(onClose)
          .catch(() => undefined);
      }}
    >
      <TextField
        label="Name"
        hint="Its agents read the new name in their prompt from their next turn."
        value={name}
        onChange={setName}
        error={parsed.success || name === department.name ? undefined : 'Give it a name.'}
      />
      <FormError message={rename.error === null ? null : errorMessage(rename.error)} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          isBusy={rename.isPending}
          disabled={!parsed.success}
        >
          Rename
        </Button>
      </div>
    </form>
  );
}

/** Renames a department; the form starts from its current name each time it opens. */
export function RenameDepartmentDialog({ department, onClose }: RenameDepartmentDialogProps) {
  return (
    <Dialog
      isOpen={department !== null}
      onClose={onClose}
      title={department === null ? 'Rename' : `Rename ${department.name}`}
    >
      {department !== null && (
        <RenameForm key={department.id} department={department} onClose={onClose} />
      )}
    </Dialog>
  );
}
