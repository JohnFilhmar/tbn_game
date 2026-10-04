import { AgentSchema, type Agent } from '@tbn/contracts';
import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { errorMessage } from '@/lib/api/apiError';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCommand } from '@/lib/data/useCommand';

/** Props of `RehireButton`. */
export interface RehireButtonProps {
  agent: Agent;
  size?: 'sm' | 'md';
}

/**
 * Brings a dismissed or ended agent back to work, idle in its department. An intern whose manager
 * is gone answers why it cannot come back.
 */
export function RehireButton({ agent, size = 'md' }: RehireButtonProps) {
  const rehire = useCommand(
    (api, id: string, commandId) =>
      api.send('POST', `/agents/${id}/rehire`, AgentSchema, { commandId }),
    (cache, saved) => putRow(cache, COLLECTIONS.agents, saved),
  );
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size={size}
        onClick={() => {
          rehire.submit(agent.id).catch(() => undefined);
        }}
        isBusy={rehire.isPending}
        aria-label={`Rehire ${agent.name}`}
      >
        Rehire
      </Button>
      <FormError message={rehire.error === null ? null : errorMessage(rehire.error)} />
    </span>
  );
}
