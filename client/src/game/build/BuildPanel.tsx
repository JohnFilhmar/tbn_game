import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ArrangedPack } from '@/game/props/arrangedPack';
import { layoutProblems } from '@/game/props/layoutProblems';
import { isTypingTarget } from '@/game/world/keyboard';
import { queryKeys } from '@/lib/data/collections';
import { cx } from '@/lib/ui/cx';
import { BuildCatalog } from './BuildCatalog';
import { BuildSelection } from './BuildSelection';
import { hasUnsavedChanges, useBuildStore } from './buildStore';
import { BuildTheme } from './BuildTheme';
import { turned, withPlacement, withoutPlacement } from './draft';
import { dropHeld } from './placing';
import { useLayoutCommands } from './useLayoutCommands';

/** Props of `BuildPanel`. */
export interface BuildPanelProps {
  /** The pack as saved, whose shell and default the draft is checked against. */
  arranged: ArrangedPack;
  /** The pack's default props, for Reset. */
  defaults: ArrangedPack['placements'];
}

type Tab = 'catalog' | 'theme';
type Confirming = 'leave' | 'reset' | null;

/**
 * Build mode's panel: the catalog and the theme, the selected prop, every reason the layout
 * cannot be saved yet, and Save, Undo, Redo, Reset and Leave. Its keys: R turns, Delete removes,
 * Ctrl+Z and Ctrl+Shift+Z undo and redo, and Escape drops what is held, then the selection, then
 * leaves, asking first when there is something unsaved.
 */
export function BuildPanel({ arranged, defaults }: BuildPanelProps) {
  const environment = useBuildStore((state) => state.environment);
  const history = useBuildStore((state) => state.history);
  const saved = useBuildStore((state) => state.saved);
  const selectedId = useBuildStore((state) => state.selectedId);
  const holding = useBuildStore((state) => state.holding);
  const store = useBuildStore();
  const client = useQueryClient();
  const commands = useLayoutCommands(arranged.manifest.name);
  const [tab, setTab] = useState<Tab>('catalog');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const draft = history?.present ?? null;
  const problems = useMemo(
    () =>
      draft === null
        ? []
        : layoutProblems(arranged.manifest.bounds, arranged.manifest, draft.placements),
    [draft, arranged.manifest],
  );
  const isUnsaved = hasUnsavedChanges({ history, saved });
  const selected = draft?.placements.find((one) => one.id === selectedId);

  const leave = (): void => {
    if (isUnsaved) setConfirming('leave');
    else store.close();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target) || event.defaultPrevented) return;
      const state = useBuildStore.getState();
      const present = state.history?.present;
      const chosen = present?.placements.find((one) => one.id === state.selectedId);
      const isMod = event.ctrlKey || event.metaKey;
      if (isMod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (isMod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        state.redo();
      } else if (event.key.toLowerCase() === 'r' && !isMod) {
        if (state.holding !== null) state.hold(turned(state.holding));
        else if (chosen !== undefined) state.change((d) => withPlacement(d, turned(chosen)));
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && chosen !== undefined) {
        if (chosen.kind !== 'computer_desk') state.change((d) => withoutPlacement(d, chosen.id));
      } else if (event.key === 'Enter' && state.holding !== null) {
        event.preventDefault();
        dropHeld(arranged.manifest.bounds, arranged.manifest);
      } else if (event.key === 'Escape') {
        if (state.holding !== null) state.hold(null);
        else if (state.selectedId !== null) state.select(null);
        else leave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (environment === null || draft === null) return null;

  const save = async (): Promise<void> => {
    setIsSaving(true);
    setMessage(null);
    try {
      const result = await commands.save(draft, store.baseRevision);
      if (result === null) {
        setIsConflict(true);
        setMessage('This layout was saved in another tab since you started. Load it to go on.');
      } else {
        store.markSaved(draft, result.revision);
        setMessage('Saved.');
      }
    } catch {
      setMessage('The layout could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  };
  const loadSaved = async (): Promise<void> => {
    await client.invalidateQueries({ queryKey: queryKeys.world(environment) });
    setIsConflict(false);
    setMessage(null);
    store.close();
  };
  const reset = async (): Promise<void> => {
    setConfirming(null);
    await commands.reset();
    const fresh = { placements: defaults, theme: {} };
    store.open(environment, fresh, 0, store.focus);
    setMessage('Back to the pack default.');
  };

  return (
    <aside
      aria-label="Build mode"
      className="dark pointer-events-auto absolute top-3 bottom-3 left-3 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-lg border-2 border-slate-700 bg-slate-900/90 p-3 text-slate-100 shadow-chunk backdrop-blur motion-safe:animate-slide-in"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-wide">
          Build: {arranged.manifest.title}
        </h2>
        <Button size="sm" variant="ghost" onClick={leave} title="Leave build mode (Escape)">
          Leave
        </Button>
      </header>
      <div role="tablist" aria-label="Build panel" className="flex gap-1.5">
        {(['catalog', 'theme'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => {
              setTab(name);
              store.select(null);
            }}
            className={cx(
              'rounded-md px-3 py-1 font-display text-sm font-semibold',
              tab === name
                ? 'bg-teal-500 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700',
            )}
          >
            {name === 'catalog' ? 'Catalog' : 'Theme'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {holding !== null ? (
          <p className="text-sm text-slate-300">
            Click the floor or press Enter to place it. R turns it, Escape puts it back.
          </p>
        ) : selected !== undefined ? (
          <BuildSelection placement={selected} />
        ) : tab === 'catalog' ? (
          <BuildCatalog manifest={arranged.manifest} />
        ) : (
          <BuildTheme />
        )}
      </div>
      {problems.length > 0 && (
        <ul
          aria-label="Why this cannot be saved yet"
          className="flex flex-col gap-1 text-sm text-amber-300"
        >
          {problems.slice(0, 4).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {message !== null && (
        <p role="status" className="text-sm text-slate-200">
          {message}
        </p>
      )}
      <footer className="flex flex-wrap gap-1.5">
        {isConflict ? (
          <Button size="sm" variant="primary" onClick={() => void loadSaved()}>
            Load the saved layout
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            isBusy={isSaving}
            disabled={!isUnsaved || problems.length > 0}
            onClick={() => void save()}
          >
            Save
          </Button>
        )}
        <Button
          size="sm"
          onClick={store.undo}
          disabled={history === null || history.past.length === 0}
        >
          Undo
        </Button>
        <Button
          size="sm"
          onClick={store.redo}
          disabled={history === null || history.future.length === 0}
        >
          Redo
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming('reset')}>
          Reset
        </Button>
      </footer>
      <ConfirmDialog
        isOpen={confirming === 'leave'}
        title="Leave without saving?"
        message="Your changes to this layout are not saved."
        confirmLabel="Leave"
        cancelLabel="Keep building"
        onConfirm={() => {
          setConfirming(null);
          store.close();
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        isOpen={confirming === 'reset'}
        title="Reset to the pack default?"
        message="Every prop and colour of this environment goes back to how the pack ships it."
        confirmLabel="Reset"
        onConfirm={() => void reset()}
        onCancel={() => setConfirming(null)}
      />
    </aside>
  );
}
