import { AgentSchema, UpdateAgentSchema, type Agent } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { Panel } from '@/components/Panel';
import { QueryStatus } from '@/components/states/QueryStatus';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { AgentFields } from '../AgentFields';
import { agentDraftOf, agentInput } from '../agentDraft';

/** The agent's profile, models, appearance and tool policy, edited in one form. */
export function ProfileTab() {
  const agent = useOutletContext<Agent>();
  const api = useApi();
  const client = useQueryClient();
  const providers = useCollection(COLLECTIONS.providers);
  const form = useForm({
    initial: agentDraftOf(agent),
    schema: UpdateAgentSchema,
    toInput: (draft) => agentInput(draft),
    onSubmit: async (body, commandId) => {
      const updated = await api.send('PATCH', `/agents/${agent.id}`, AgentSchema, {
        body,
        commandId,
      });
      putRow(client, COLLECTIONS.agents, updated);
      form.reset(agentDraftOf(updated));
    },
  });
  if (providers.data === undefined) return <QueryStatus queries={[providers]} label="providers" />;
  const isDismissed = agent.status === 'dismissed';
  return (
    <Panel
      title="Profile"
      description={
        isDismissed
          ? 'A dismissed agent keeps its profile as it was.'
          : 'Changes apply from the agent’s next turn.'
      }
    >
      <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit}>
        <AgentFields form={form} providers={providers.data} disabled={isDismissed} />
        <FormError message={form.errors['']} />
        {!isDismissed && (
          <div className="flex justify-end gap-2">
            <Button onClick={() => form.reset(agentDraftOf(agent))}>Undo changes</Button>
            <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
              Save
            </Button>
          </div>
        )}
      </form>
    </Panel>
  );
}
