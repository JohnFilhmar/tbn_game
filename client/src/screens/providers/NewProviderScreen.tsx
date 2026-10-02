import { CreateProviderSchema, ProviderSchema } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Button, buttonClasses } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { newCommandId } from '@/lib/api/apiClient';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { EMPTY_PROVIDER_DRAFT, providerInput } from './providerDraft';
import { ProviderFields } from './ProviderFields';

/** Adds a model provider: an API endpoint, its key and the models it offers. */
export function NewProviderScreen() {
  const api = useApi();
  const client = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    initial: EMPTY_PROVIDER_DRAFT,
    schema: CreateProviderSchema,
    toInput: providerInput,
    onSubmit: async (body) => {
      const provider = await api.send('POST', '/providers', ProviderSchema, {
        body,
        commandId: newCommandId(),
      });
      putRow(client, COLLECTIONS.providers, provider);
      await navigate(`/providers/${provider.id}`);
    },
  });
  return (
    <>
      <PageHeader
        title="Add a provider"
        description="An API your agents think with. The key is encrypted and never leaves the server."
        back={{ to: '/providers', label: 'Providers' }}
      />
      <Panel>
        <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit}>
          <ProviderFields form={form} hasSavedKey={false} />
          <FormError message={form.errors['']} />
          <div className="flex justify-end gap-2">
            <Link to="/providers" className={buttonClasses('secondary')}>
              Cancel
            </Link>
            <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
              Add provider
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
