import type { Agent } from '@tbn/contracts';
import { useOutletContext } from 'react-router';
import { Conversation } from '@/components/conversation/Conversation';

/** The chat with one agent on the desk. */
export function ChatTab() {
  const agent = useOutletContext<Agent>();
  return <Conversation agent={agent} />;
}
