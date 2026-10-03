import { useWorldStore } from '@/game/world/worldStore';
import type { AgentRow } from './useAgentRows';

/** Props of `NarrationPanel`. */
export interface NarrationPanelProps {
  rows: readonly AgentRow[];
  /** Teleports the owner to an agent. */
  onGo: (row: AgentRow) => void;
}

/** How many agents the number keys reach. */
export const MOST_HOTKEYS = 9;

/**
 * The world in words: what each agent is doing, with a way to go to it, and each thing that
 * happened as a sentence. It is the world for anyone who cannot see the canvas, and what the tests
 * read.
 */
export function NarrationPanel({ rows, onGo }: NarrationPanelProps) {
  const narration = useWorldStore((state) => state.narration);
  return (
    <section
      aria-label="What is happening"
      className="pointer-events-auto flex w-80 max-w-full flex-col gap-2 rounded-lg border-2 border-slate-700 bg-slate-900/85 p-3 text-sm text-slate-100 shadow-chunk backdrop-blur"
    >
      <h2 className="font-display text-xs font-semibold tracking-widest text-slate-300 uppercase">
        In the world
      </h2>
      {rows.length === 0 ? (
        <p className="text-slate-300">Nobody is at work yet. Recruit an agent from the desk.</p>
      ) : (
        <ul aria-label="Agents in the world" className="flex flex-col gap-1">
          {rows.map((row, index) => (
            <li key={row.agentId} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="font-medium">{row.name}</span>: {row.label}
              </span>
              <button
                type="button"
                aria-label={`Go to ${row.name}`}
                onClick={() => onGo(row)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-display text-xs font-semibold text-slate-100 shadow-chunk hover:bg-slate-700 active:translate-y-px active:shadow-none"
              >
                Go
                {index < MOST_HOTKEYS && (
                  <kbd className="rounded-sm bg-slate-950 px-1 text-slate-300">{index + 1}</kbd>
                )}
              </button>
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
