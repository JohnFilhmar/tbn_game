import { Link } from 'react-router';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

/** Props of `AgentName`. */
export interface AgentNameProps {
  agentId: string | null;
  /** Plain text instead of a link to the agent. */
  isPlain?: boolean;
}

/** An agent's name as a link to its screen, from the loaded roster. */
export function AgentName({ agentId, isPlain = false }: AgentNameProps) {
  const { data } = useCollection(COLLECTIONS.agents);
  if (agentId === null) return <span>You</span>;
  const agent = data?.find((row) => row.id === agentId);
  const name = agent?.name ?? 'Unknown agent';
  if (isPlain || agent === undefined) return <span>{name}</span>;
  return (
    <Link to={`/agents/${agentId}`} className="text-teal-800 hover:underline dark:text-teal-300">
      {name}
    </Link>
  );
}
