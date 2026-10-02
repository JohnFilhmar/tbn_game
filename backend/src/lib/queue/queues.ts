/** Queue that wakes an agent to work through its queued tasks and pending owner messages. */
export const AGENT_WAKE_QUEUE = 'agent_wake';

/** Payload of an `agent_wake` job. */
export interface AgentWakeJob {
  owner_id: string;
  agent_id: string;
}
