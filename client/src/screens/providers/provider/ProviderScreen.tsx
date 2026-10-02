import { ProviderSchema, UpdateProviderSchema, type Provider } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, buttonClasses } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormError } from '@/components/FormError';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { newCommandId } from '@/lib/api/apiClient';
import { errorMessage } from '@/lib/api/apiError';
import { dropRow, putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { providerDraftOf, providerInput } from '../providerDraft';
import { ProviderFields } from '../ProviderFields';
import { ProviderHealth } from '../ProvidersScreen';
import { CapWindowsPanel } from './CapWindowsPanel';
import { UsagePanel } from './UsagePanel';

function EditProvider({ provider }: { provider: Provider }) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: providerDraftOf(provider),
    schema: UpdateProviderSchema,
    toInput: providerInput,
    onSubmit: async (body) => {
      const saved = await api.send('PATCH', `/providers/${provider.id}`, ProviderSchema, {
        body,
        commandId: newCommandId(),
      });
      putRow(client, COLLECTIONS.providers, saved);
      form.reset(providerDraftOf(saved));
    },
  });
  return (
    <Panel title="Settings" description="Sending the models replaces the whole list.">
      <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit}>
        <ProviderFields form={form} hasSavedKey />
        <FormError message={form.errors['']} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => form.reset(providerDraftOf(provider))}>Undo changes</Button>
          <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** One provider: its state with resume, its settings, its usage and its caps. */
export function ProviderScreen() {
  const { providerId = '' } = useParams();
  const providers = useCollection(COLLECTIONS.providers);
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const resume = useCommand(
    (api, id: string, commandId) =>
      api.send('POST', `/providers/${id}/resume`, ProviderSchema, { commandId }),
    (cache, provider) => putRow(cache, COLLECTIONS.providers, provider),
  );
  const remove = useCommand(
    (api, id: string, commandId) => api.sendNoContent('DELETE', `/providers/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.providers, id),
  );

  if (providers.data === undefined) return <QueryStatus queries={[providers]} label="provider" />;
  const provider = providers.data.find((row) => row.id === providerId);
  if (provider === undefined) {
    return (
      <EmptyState
        title="This provider does not exist"
        action={
          <Link to="/providers" className={buttonClasses('secondary')}>
            Back to the providers
          </Link>
        }
      />
    );
  }
  const isHeld = provider.out_of_credit_since !== null || provider.breaker_open_until !== null;
  return (
    <>
      <PageHeader
        back={{ to: '/providers', label: 'Providers' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {provider.name}
            <ProviderHealth provider={provider} />
          </span>
        }
        description={`${provider.base_url}${provider.is_local ? ' · local' : ''}`}
        actions={
          <>
            {isHeld && (
              <Button
                variant="primary"
                isBusy={resume.isPending}
                onClick={() => void resume.submit(provider.id).catch(() => undefined)}
              >
                Resume calls
              </Button>
            )}
            <Button variant="danger" onClick={() => setIsDeleting(true)}>
              Delete
            </Button>
          </>
        }
      />
      <FormError message={resume.error === null ? null : errorMessage(resume.error)} />
      <EditProvider key={provider.id} provider={provider} />
      <UsagePanel provider={provider} />
      <CapWindowsPanel provider={provider} />
      <ConfirmDialog
        isOpen={isDeleting}
        title={`Delete ${provider.name}?`}
        message="Its key is erased. A provider that agents still use cannot be deleted."
        confirmLabel="Delete"
        isBusy={remove.isPending}
        error={remove.error === null ? null : errorMessage(remove.error)}
        onCancel={() => {
          setIsDeleting(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove
            .submit(provider.id)
            .then(() => navigate('/providers'))
            .catch(() => undefined);
        }}
      />
    </>
  );
}
