import { IntegrationSchema, UpdateIntegrationSchema, type Integration } from '@tbn/contracts';
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
import { errorMessage } from '@/lib/api/apiError';
import { dropRow, putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { integrationDraftOf, integrationInput } from './integrationDraft';
import { IntegrationFields } from './IntegrationFields';
import { TestPanel } from './TestPanel';

function EditIntegration({ integration }: { integration: Integration }) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: integrationDraftOf(integration),
    schema: UpdateIntegrationSchema,
    toInput: integrationInput,
    onSubmit: async (body, commandId) => {
      const saved = await api.send('PATCH', `/integrations/${integration.id}`, IntegrationSchema, {
        body,
        commandId,
      });
      putRow(client, COLLECTIONS.integrations, saved);
      form.reset(integrationDraftOf(saved));
    },
  });
  return (
    <Panel title="Request">
      <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit}>
        <IntegrationFields form={form} hasSavedToken={integration.token_set} />
        <FormError message={form.errors['']} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => form.reset(integrationDraftOf(integration))}>Undo changes</Button>
          <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** One integration: its request template, a test call, and delete. */
export function IntegrationScreen() {
  const { integrationId = '' } = useParams();
  const integrations = useCollection(COLLECTIONS.integrations);
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const remove = useCommand(
    (api, id: string, commandId) =>
      api.sendNoContent('DELETE', `/integrations/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.integrations, id),
  );
  if (integrations.data === undefined) {
    return <QueryStatus queries={[integrations]} label="integration" />;
  }
  const integration = integrations.data.find((row) => row.id === integrationId);
  if (integration === undefined) {
    return (
      <EmptyState
        title="This integration does not exist"
        action={
          <Link to="/integrations" className={buttonClasses('secondary')}>
            Back to the integrations
          </Link>
        }
      />
    );
  }
  return (
    <>
      <PageHeader
        back={{ to: '/integrations', label: 'Integrations' }}
        title={integration.name}
        description={`Agents it is attached to call it as a tool; attach it on an agent's Tools tab.`}
        actions={
          <Button variant="danger" onClick={() => setIsDeleting(true)}>
            Delete
          </Button>
        }
      />
      <EditIntegration key={integration.id} integration={integration} />
      <TestPanel integration={integration} />
      <ConfirmDialog
        isOpen={isDeleting}
        title={`Delete ${integration.name}?`}
        message="It is detached from every agent, its notification channels are deleted, and its token is erased."
        confirmLabel="Delete"
        isBusy={remove.isPending}
        error={remove.error === null ? null : errorMessage(remove.error)}
        onCancel={() => {
          setIsDeleting(false);
          remove.reset();
        }}
        onConfirm={() => {
          remove
            .submit(integration.id)
            .then(() => navigate('/integrations'))
            .catch(() => undefined);
        }}
      />
    </>
  );
}
