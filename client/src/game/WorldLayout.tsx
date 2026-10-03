import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ownerAppearanceOf, resolveAppearance } from '@/game/assets/appearance';
import { CHARACTER_SET } from '@/game/assets/characters';
import { PACKS } from '@/game/assets/packs';
import { Hud } from '@/game/hud/Hud';
import { isSeatedPath } from '@/game/world/seat';
import { useWorldHour } from '@/game/world/useWorldHour';
import { canRenderWorld } from '@/game/world/webgl';
import { useWorldStore } from '@/game/world/worldStore';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection, usePreferences } from '@/lib/data/queries';
import { cx } from '@/lib/ui/cx';
import { useSession } from '@/providers/SessionProvider';

const LazyWorld = lazy(() =>
  import('@/game/world/World').then((module) => ({ default: module.World })),
);

/** How long every frame renders after the owner sits down or stands up: the camera's glide. */
const GLIDE_MS = 1_500;

function WorldNotice({ text }: { text: string }) {
  return (
    <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center">
      {text}
    </p>
  );
}

/** Starts the glide window each time the owner sits down or stands up, but not on arrival. */
function useGlide(isSeated: boolean): void {
  const setGliding = useWorldStore((state) => state.setGliding);
  const previous = useRef(isSeated);
  // A layout effect, so the monitor's power-on starts with its first paint.
  useLayoutEffect(() => {
    if (previous.current === isSeated) return undefined;
    previous.current = isSeated;
    setGliding(true);
    const timer = window.setTimeout(() => setGliding(false), GLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [isSeated, setGliding]);
}

/**
 * The world and everything over it. The canvas is the root of every route, signed in or not: at
 * `/` the owner walks in it with the HUD, and on every other route, sign in and the desk screens,
 * the owner sits at the computer and the screen renders in the monitor. The route alone decides,
 * so a reload or a deep link lands seated, and every desk screen keeps its address.
 */
export function WorldLayout() {
  const location = useLocation();
  const { token } = useSession();
  const isSignedIn = token !== null;
  const isSeated = isSeatedPath(location.pathname);
  const { data: preferences } = usePreferences();
  const { data: agents } = useCollection(COLLECTIONS.agents);
  const { data: departments } = useCollection(COLLECTIONS.departments);
  const { data: approvals } = useCollection(COLLECTIONS.approvals);
  const setLastDesktopPath = useWorldStore((state) => state.setLastDesktopPath);
  const environment = useWorldStore((state) => state.environment);
  const setEnvironment = useWorldStore((state) => state.setEnvironment);
  const isGliding = useWorldStore((state) => state.isGliding);
  const isFaded = useWorldStore((state) => state.isFaded);
  const { pathname, search } = location;
  useGlide(isSeated);

  useEffect(() => {
    if (isSeated && pathname !== '/sign_in') setLastDesktopPath(`${pathname}${search}`);
  }, [isSeated, pathname, search, setLastDesktopPath]);

  const preferredEnvironment = preferences?.environment;
  useEffect(() => {
    if (preferredEnvironment !== undefined) setEnvironment(preferredEnvironment);
  }, [preferredEnvironment, setEnvironment]);

  const pack = PACKS[preferredEnvironment ?? environment];
  const hour = useWorldHour(
    preferences?.time_of_day ?? 'clock',
    preferences?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const ownerLook = preferences?.owner_appearance;
  const ownerAppearance = useMemo(
    () => resolveAppearance(CHARACTER_SET, ownerAppearanceOf(ownerLook)),
    [ownerLook],
  );
  const pendingAgentIds = useMemo(
    () =>
      new Set(
        (approvals ?? [])
          .filter((approval) => approval.status === 'pending')
          .map((approval) => approval.agent_id),
      ),
    [approvals],
  );
  const canRender = useMemo(() => canRenderWorld(), []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-900 text-slate-100">
      {canRender ? (
        <Suspense fallback={<WorldNotice text="Loading the world…" />}>
          <LazyWorld
            pack={pack}
            hour={hour}
            ownerAppearance={ownerAppearance}
            agents={agents}
            departments={departments}
            isActive={isSignedIn && !isSeated}
            isSeated={isSeated}
            isGliding={isGliding}
            pendingAgentIds={pendingAgentIds}
          />
        </Suspense>
      ) : (
        <WorldNotice text="This device cannot draw the world. The desk still works." />
      )}
      {isSignedIn && <Hud isOverlayOpen={isSeated} packTitle={pack.manifest.title} />}
      <Outlet />
      <div
        aria-hidden="true"
        className={cx(
          'pointer-events-none fixed inset-0 z-50 bg-slate-950 transition-opacity duration-150 motion-reduce:transition-none',
          isFaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
