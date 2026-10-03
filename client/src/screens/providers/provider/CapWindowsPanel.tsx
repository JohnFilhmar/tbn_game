import { CapWindowStatusSchema, type CapWindowStatus, type Provider } from '@tbn/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog } from '@/components/Dialog';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { errorMessage } from '@/lib/api/apiError';
import { queryKeys } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';
import { formatMoney, formatNumber } from '@/lib/format/numbers';
import { removeRow } from '@/lib/realtime/applyChanges';
import { useApi } from '@/providers/SessionProvider';
import { CapWindowForm } from './CapWindowForm';

function amount(window: CapWindowStatus, value: number): string {
  return window.unit === 'money' ? formatMoney(value) : formatNumber(value, true);
}

function CapRow(props: { window: CapWindowStatus; onEdit: () => void; onDelete: () => void }) {
  const { window } = props;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{window.name}</span>
          <StatusBadge status={window.state} />
          {!window.enforced && <StatusBadge status="neutral" label="Shown only" tone="neutral" />}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={props.onEdit}>
            Edit<span className="sr-only"> {window.name}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onDelete}>
            Delete<span className="sr-only"> {window.name}</span>
          </Button>
        </div>
      </div>
      <meter
        aria-label={`${window.name} used`}
        min={0}
        max={window.limit}
        value={Math.min(window.used, window.limit)}
        high={(window.limit * window.effective_threshold_percent) / 100}
        optimum={0}
        className="h-2 w-full"
      />
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {amount(window, window.used)} of {amount(window, window.limit)}{' '}
        {window.unit === 'money' ? '' : window.unit} · {window.reset_mode} {window.length_count}{' '}
        {window.length_unit}
        {window.length_count === 1 ? '' : 's'} · threshold {window.effective_threshold_percent}%
        {window.model_id !== null && ` · ${window.model_id}`}
        {window.resets_at !== null && (
          <>
            {' '}
            · resets <TimeStamp iso={window.resets_at} />
          </>
        )}
      </p>
    </li>
  );
}

/** The usage caps of one provider key, with how much of each window is used. */
export function CapWindowsPanel({ provider }: { provider: Provider }) {
  const api = useApi();
  const windows = useQuery({
    queryKey: queryKeys.capWindows(provider.id),
    queryFn: () => api.get(`/providers/${provider.id}/cap_windows`, CapWindowStatusSchema.array()),
  });
  const [editing, setEditing] = useState<CapWindowStatus | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CapWindowStatus | null>(null);
  const remove = useCommand(
    (client, window: CapWindowStatus, commandId) =>
      client.sendNoContent('DELETE', `/providers/${provider.id}/cap_windows/${window.id}`, {
        commandId,
      }),
    (cache, _output, window) =>
      cache.setQueryData<CapWindowStatus[]>(queryKeys.capWindows(provider.id), (rows) =>
        rows === undefined ? rows : removeRow(rows, window.id),
      ),
  );

  return (
    <Panel
      title="Usage caps"
      description="Windows of tokens, requests or money on this key, counted from the runtime's own records."
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          Add a cap
        </Button>
      }
    >
      {windows.data === undefined ? (
        <QueryStatus queries={[windows]} label="caps" />
      ) : windows.data.length === 0 ? (
        <EmptyState
          title="No caps"
          description="Usage on this key is not limited or shown by window."
        />
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {windows.data.map((window) => (
            <CapRow
              key={window.id}
              window={window}
              onEdit={() => setEditing(window)}
              onDelete={() => setDeleting(window)}
            />
          ))}
        </ul>
      )}
      <Dialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'Add a cap' : `Edit ${editing.name}`}
      >
        {editing !== null && (
          <CapWindowForm
            provider={provider}
            window={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete ${deleting?.name ?? 'the cap'}?`}
        message="Usage stays recorded; only this window goes."
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
            .submit(deleting)
            .then(() => setDeleting(null))
            .catch(() => undefined);
        }}
      />
    </Panel>
  );
}
