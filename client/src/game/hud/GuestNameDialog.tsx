import { useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/fields/TextField';
import { useSession } from '@/providers/SessionProvider';

/**
 * Asks a guest arriving for the first time what to call them. Everyone in the world sees the
 * name over their head and on their messages; it is theirs for as long as they visit.
 */
export function GuestNameDialog() {
  const { guest, nameGuest } = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  if (guest === null || guest.name !== null) return null;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await nameGuest(name.trim());
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'That name did not work.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen
      onClose={() => undefined}
      title={`Welcome to ${guest.owner_username}'s company`}
      description="Pick the name everyone here will see. Letters, digits, spaces, _ and -."
    >
      <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <TextField label="Your name" value={name} onChange={setName} />
        <FormError message={error} />
        <Button type="submit" variant="primary" isBusy={isSaving}>
          Enter the world
        </Button>
      </form>
    </Dialog>
  );
}
