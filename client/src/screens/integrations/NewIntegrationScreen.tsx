import { CreateIntegrationSchema, IntegrationSchema } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Button, buttonClasses } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { EMPTY_INTEGRATION_DRAFT, integrationInput } from './integrationDraft';
import { IntegrationFields } from './IntegrationFields';

/** Adds an integration from a request template. */
export function NewIntegrationScreen() {
  const api = useApi();
  const client = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    initial: EMPTY_INTEGRATION_DRAFT,
    schema: CreateIntegrationSchema,
    toInput: integrationInput,
    onSubmit: async (body, commandId) => {
      const integration = await api.send('POST', '/integrations', IntegrationSchema, {
        body,
        commandId,
      });
      putRow(client, COLLECTIONS.integrations, integration);
      await navigate(`/integrations/${integration.id}`);
    },
  });
  return (
    <>
      <PageHeader
        title="Add an integration"
        back={{ to: '/integrations', label: 'Integrations' }}
        description="The agent fills the placeholders; everything else is fixed by you."
      />
      <Panel>
        <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit}>
          <IntegrationFields form={form} hasSavedToken={false} />
          <FormError message={form.errors['']} />
          <div className="flex justify-end gap-2">
            <Link to="/integrations" className={buttonClasses('secondary')}>
              Cancel
            </Link>
            <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
              Add integration
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
