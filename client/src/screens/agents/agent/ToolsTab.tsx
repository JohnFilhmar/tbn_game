import {
  AgentAttachmentsSchema,
  IntegrationSchema,
  PluginSchema,
  type Agent,
  type AgentAttachments,
} from '@tbn/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { Panel } from '@/components/Panel';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { errorMessage } from '@/lib/api/apiError';
import { COLLECTIONS, queryKeys } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { useApi } from '@/providers/SessionProvider';

type Kind = 'integrations' | 'plugins';

interface Toggle {
  kind: Kind;
  id: string;
  attach: boolean;
}

function withToggle(current: AgentAttachments, toggle: Toggle): AgentAttachments {
  const field = toggle.kind === 'integrations' ? 'integration_ids' : 'plugin_ids';
  const ids = current[field].filter((id) => id !== toggle.id);
  return { ...current, [field]: toggle.attach ? [...ids, toggle.id] : ids };
}

function AttachList(props: {
  title: string;
  description: string;
  empty: { title: string; to: string; label: string };
  rows: ReadonlyArray<{ id: string; name: string; detail: string }>;
  attached: readonly string[];
  busyId: string | null;
  onToggle: (id: string, attach: boolean) => void;
}) {
  return (
    <Panel title={props.title} description={props.description}>
      {props.rows.length === 0 ? (
        <EmptyState
          title={props.empty.title}
          action={
            <Link
              to={props.empty.to}
              className="text-sm text-teal-800 underline dark:text-teal-300"
            >
              {props.empty.label}
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {props.rows.map((row) => {
            const isAttached = props.attached.includes(row.id);
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex flex-col">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{row.detail}</span>
                </div>
                <Button
                  size="sm"
                  variant={isAttached ? 'secondary' : 'primary'}
                  isBusy={props.busyId === row.id}
                  onClick={() => props.onToggle(row.id, !isAttached)}
                >
                  {isAttached ? 'Detach' : 'Attach'}
                  <span className="sr-only"> {row.name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The integrations the agent may call and the plugins whose tools it sees. */
export function ToolsTab() {
  const agent = useOutletContext<Agent>();
  const api = useApi();
  const integrations = useCollection(COLLECTIONS.integrations);
  const plugins = useCollection(COLLECTIONS.plugins);
  const [busyId, setBusyId] = useState<string | null>(null);
  const attachments = useQuery({
    queryKey: queryKeys.agentAttachments(agent.id),
    queryFn: () => api.get(`/agents/${agent.id}/attachments`, AgentAttachmentsSchema),
  });
  const toggle = useCommand(
    async (apiClient, input: Toggle, commandId) => {
      const path = `/agents/${agent.id}/${input.kind}/${input.id}`;
      if (!input.attach) return apiClient.sendNoContent('DELETE', path, { commandId });
      if (input.kind === 'integrations') {
        await apiClient.send('POST', path, IntegrationSchema, { commandId });
      } else {
        await apiClient.send('POST', path, PluginSchema, { commandId });
      }
    },
    (cache, _output, input) =>
      cache.setQueryData<AgentAttachments>(queryKeys.agentAttachments(agent.id), (current) =>
        current === undefined ? current : withToggle(current, input),
      ),
  );

  if (
    integrations.data === undefined ||
    plugins.data === undefined ||
    attachments.data === undefined
  ) {
    return <QueryStatus queries={[integrations, plugins, attachments]} label="tools" />;
  }
  const onToggle = (kind: Kind) => (id: string, attach: boolean) => {
    setBusyId(id);
    toggle
      .submit({ kind, id, attach })
      .catch(() => undefined)
      .finally(() => setBusyId(null));
  };
  return (
    <div className="flex flex-col gap-6">
      <FormError message={toggle.error === null ? null : errorMessage(toggle.error)} />
      <AttachList
        title="Integrations"
        description="Each attached integration is a tool the agent can call; outward calls of a tainted run wait for your approval."
        empty={{ title: 'No integrations yet', to: '/integrations', label: 'Add an integration' }}
        rows={integrations.data.map((row) => ({
          id: row.id,
          name: row.name,
          detail: `${row.method} ${row.url}`,
        }))}
        attached={attachments.data.integration_ids}
        busyId={busyId}
        onToggle={onToggle('integrations')}
      />
      <AttachList
        title="Plugins"
        description="The tools of each attached plugin join the agent's tool list. What they return taints the run."
        empty={{ title: 'No plugins yet', to: '/plugins', label: 'Add a plugin' }}
        rows={plugins.data.map((row) => ({
          id: row.id,
          name: row.name,
          detail: `${row.url}${row.enabled ? '' : ' (disabled)'}`,
        }))}
        attached={attachments.data.plugin_ids}
        busyId={busyId}
        onToggle={onToggle('plugins')}
      />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The policy of each tool is on the Profile tab.
      </p>
    </div>
  );
}
