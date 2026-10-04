import type { Activity } from '@/game/npcs/agentActor';
import { useWorldStore } from '@/game/world/worldStore';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

const ACTIVITY_LABELS: Record<Activity, string> = {
  at_desk: 'at the desk',
  walking: 'walking',
  working: 'working',
  handing_off: 'handing off',
  returning: 'returning',
  arriving: 'arriving',
  leaving: 'leaving',
  gone: 'gone',
  wandering: 'taking a break',
  thinking: 'thinking',
  talking: 'talking with you',
};

const LABELS_BY_NAME = new Map<string, string>(Object.entries(ACTIVITY_LABELS));

/** One agent in the world as the HUD lists it. */
export interface AgentRow {
  agentId: string;
  name: string;
  /** What it is doing, in words. */
  label: string;
}

/**
 * The agents in the world in the order they arrived, with what each is doing. The HUD lists them
 * and the number keys go to them in this order.
 */
export function useAgentRows(): AgentRow[] {
  const activities = useWorldStore((state) => state.activities);
  const { data: agents } = useCollection(COLLECTIONS.agents);
  const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
  return Object.entries(activities).map(([agentId, activity]) => ({
    agentId,
    name: names.get(agentId) ?? 'An agent',
    label: LABELS_BY_NAME.get(activity) ?? activity,
  }));
}
