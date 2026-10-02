import { AgentSchema, RecruitAgentSchema } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Button, buttonClasses } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';
import { AgentFields } from './AgentFields';
import { agentInput, EMPTY_AGENT_DRAFT } from './agentDraft';

/** Recruits a manager, which opens a department named after its role. */
export function RecruitScreen() {
  const api = useApi();
  const client = useQueryClient();
  const navigate = useNavigate();
  const providers = useCollection(COLLECTIONS.providers);
  const form = useForm({
    initial: EMPTY_AGENT_DRAFT,
    schema: RecruitAgentSchema,
    toInput: (draft) => agentInput(draft),
    onSubmit: async (body, commandId) => {
      const agent = await api.send('POST', '/agents', AgentSchema, {
        body,
        commandId,
      });
      putRow(client, COLLECTIONS.agents, agent);
      await navigate(`/agents/${agent.id}`);
    },
  });

  const header = (
    <PageHeader
      title="Recruit a manager"
      description="A manager takes your tasks, hires interns for parts of them and reports back."
      back={{ to: '/agents', label: 'Agents' }}
    />
  );
  if (providers.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[providers]} label="providers" />
      </>
    );
  }
  if (providers.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Add a provider first"
          description="An agent thinks with a model from one of your providers."
          action={
            <Link to="/providers/new" className={buttonClasses('primary')}>
              Add a provider
            </Link>
          }
        />
      </>
    );
  }
  return (
    <>
      {header}
      <Panel>
        <form className="flex flex-col gap-6" noValidate onSubmit={form.handleSubmit}>
          <AgentFields form={form} providers={providers.data} />
          <FormError message={form.errors['']} />
          <div className="flex justify-end gap-2">
            <Link to="/agents" className={buttonClasses('secondary')}>
              Cancel
            </Link>
            <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
              Recruit
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
