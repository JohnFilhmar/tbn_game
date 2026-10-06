import { useQuery, type QueryClient } from '@tanstack/react-query';
import { GuestInviteSchema, GuestSchema, type Guest, type GuestInvite } from '@tbn/contracts';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { queryKeys } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';
import { useApi } from '@/providers/SessionProvider';
import { GuestModelPanel } from './GuestModelPanel';
import { InviteForm } from './InviteForm';

/**
 * The owner's guests: the model they talk to agents on, invite links to send, the links still
 * waiting, and each guest with a new link to come back or a way to shut them out.
 */
export function GuestsScreen() {
  const api = useApi();
  const guests = useQuery({
    queryKey: queryKeys.guests(),
    queryFn: () => api.get('/guests', GuestSchema.array()),
  });
  const invites = useQuery({
    queryKey: queryKeys.guestInvites(),
    queryFn: () => api.get('/guests/invites', GuestInviteSchema.array()),
  });
  const [returning, setReturning] = useState<{ guest_id: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<Guest | null>(null);
  const refresh = (queryClient: QueryClient): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.guests() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.guestInvites() });
  };
  const revokeInvite = useCommand(
    (apiClient, id: string, commandId) =>
      apiClient.sendNoContent('POST', `/guests/invites/${id}/revoke`, { commandId }),
    refresh,
  );
  const revokeGuest = useCommand(
    (apiClient, id: string, commandId) =>
      apiClient.send('POST', `/guests/${id}/revoke`, GuestSchema, { commandId }),
    refresh,
  );

  const inviteColumns: Column<GuestInvite>[] = [
    { header: 'For', cell: (invite) => <span className="font-medium">{invite.label}</span> },
    { header: 'Works until', cell: (invite) => <TimeStamp iso={invite.expires_at} /> },
    {
      header: 'Actions',
      cell: (invite) => (
        <Button size="sm" variant="danger" onClick={() => void revokeInvite.submit(invite.id)}>
          Revoke
        </Button>
      ),
    },
  ];
  const guestColumns: Column<Guest>[] = [
    {
      header: 'Name',
      cell: (guest) => <span className="font-medium">{guest.name ?? '(no name yet)'}</span>,
    },
    {
      header: 'Last seen',
      cell: (guest) =>
        guest.last_seen_at === null ? 'Never' : <TimeStamp iso={guest.last_seen_at} />,
    },
    {
      header: 'Status',
      cell: (guest) => <StatusBadge status={guest.revoked_at === null ? 'active' : 'revoked'} />,
    },
    {
      header: 'Actions',
      cell: (guest) =>
        guest.revoked_at === null && (
          <span className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setReturning({ guest_id: guest.id, name: guest.name ?? 'this guest' })}
            >
              New link
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRevoking(guest)}>
              Revoke
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Guests"
        description="Friends you invite walk the world with you, read the desk, and talk with idle agents. They cannot change anything."
      />
      <GuestModelPanel />
      <InviteForm key={returning?.guest_id ?? 'new'} returning={returning} />
      {returning !== null && (
        <Button className="self-start" onClick={() => setReturning(null)}>
          Back to a new invite
        </Button>
      )}
      <Panel title="Links waiting">
        {invites.data === undefined ? (
          <QueryStatus queries={[invites]} label="invite links" />
        ) : invites.data.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">No unused links.</p>
        ) : (
          <DataTable
            caption="Invite links not used yet"
            columns={inviteColumns}
            rows={invites.data}
            rowKey={(invite) => invite.id}
          />
        )}
      </Panel>
      <Panel title="Guests">
        {guests.data === undefined ? (
          <QueryStatus queries={[guests]} label="guests" />
        ) : guests.data.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">No one has visited yet.</p>
        ) : (
          <DataTable
            caption="Your guests"
            columns={guestColumns}
            rows={guests.data}
            rowKey={(guest) => guest.id}
          />
        )}
      </Panel>
      <ConfirmDialog
        isOpen={revoking !== null}
        title={`Revoke ${revoking?.name ?? 'this guest'}?`}
        message="They leave at once and their links stop working. You can invite them again as a new guest."
        confirmLabel="Revoke"
        confirmVariant="danger"
        isBusy={revokeGuest.isPending}
        error={revokeGuest.error?.message ?? null}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking === null) return;
          void revokeGuest.submit(revoking.id).then(() => setRevoking(null));
        }}
      />
    </>
  );
}
