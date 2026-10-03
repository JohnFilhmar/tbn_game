import { useWorldStore } from '@/game/world/worldStore';
import type { Activity } from '@/game/npcs/agentActor';
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
};

const LABELS_BY_NAME = new Map<string, string>(Object.entries(ACTIVITY_LABELS));

function labelOf(activity: string): string {
  return LABELS_BY_NAME.get(activity) ?? activity;
}

/**
 * The world in words: what each agent is doing, and each thing that happened as a sentence. It is
 * the world for anyone who cannot see the canvas, and what the tests read.
 */
export function NarrationPanel() {
  const narration = useWorldStore((state) => state.narration);
  const activities = useWorldStore((state) => state.activities);
  const { data: agents } = useCollection(COLLECTIONS.agents);
  const names = new Map((agents ?? []).map((agent) => [agent.id, agent.name]));
  const rows = Object.entries(activities).map(([agentId, activity]) => ({
    agentId,
    name: names.get(agentId) ?? 'An agent',
    label: labelOf(activity),
  }));
  return (
    <section
      aria-label="What is happening"
      className="pointer-events-auto flex w-80 max-w-full flex-col gap-2 rounded-lg bg-slate-950/70 p-3 text-sm text-slate-100 backdrop-blur"
    >
      <h2 className="text-xs font-semibold tracking-wide text-slate-300 uppercase">In the world</h2>
      {rows.length === 0 ? (
        <p className="text-slate-300">Nobody is at work yet. Recruit an agent from the desk.</p>
      ) : (
        <ul aria-label="Agents in the world" className="flex flex-col gap-0.5">
          {rows.map((row) => (
            <li key={row.agentId}>
              <span className="font-medium">{row.name}</span>: {row.label}
            </li>
          ))}
        </ul>
      )}
      <ol aria-live="polite" aria-label="What happened" className="max-h-36 overflow-y-auto">
        {narration.map((line) => (
          <li key={line.id} className="text-slate-200">
            {line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
