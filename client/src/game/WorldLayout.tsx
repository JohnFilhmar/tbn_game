import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ownerAppearanceOf, resolveAppearance } from '@/game/assets/appearance';
import { CHARACTER_SET } from '@/game/assets/characters';
import { PACKS } from '@/game/assets/packs';
import { Hud } from '@/game/hud/Hud';
import { useWorldHour } from '@/game/world/useWorldHour';
import { canRenderWorld } from '@/game/world/webgl';
import { useWorldStore } from '@/game/world/worldStore';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection, usePreferences } from '@/lib/data/queries';

const LazyWorld = lazy(() =>
  import('@/game/world/World').then((module) => ({ default: module.World })),
);

function WorldNotice({ text }: { text: string }) {
  return (
    <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center">
      {text}
    </p>
  );
}

/**
 * The world and everything over it. The canvas stays mounted while the owner is signed in; the
 * desk screens render as an overlay above it on their own routes, so every deep link still works.
 */
export function WorldLayout() {
  const location = useLocation();
  const isOverlayOpen = location.pathname !== '/';
  const { data: preferences } = usePreferences();
  const { data: agents } = useCollection(COLLECTIONS.agents);
  const { data: departments } = useCollection(COLLECTIONS.departments);
  const setLastDesktopPath = useWorldStore((state) => state.setLastDesktopPath);
  const { pathname, search } = location;

  useEffect(() => {
    if (pathname !== '/') setLastDesktopPath(`${pathname}${search}`);
  }, [pathname, search, setLastDesktopPath]);

  const pack = PACKS[preferences?.environment ?? 'office'];
  const hour = useWorldHour(
    preferences?.time_of_day ?? 'clock',
    preferences?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const ownerLook = preferences?.owner_appearance;
  const ownerAppearance = useMemo(
    () => resolveAppearance(CHARACTER_SET, ownerAppearanceOf(ownerLook)),
    [ownerLook],
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
            isActive={!isOverlayOpen}
          />
        </Suspense>
      ) : (
        <WorldNotice text="This device cannot draw the world. The desk still works." />
      )}
      <Hud isOverlayOpen={isOverlayOpen} packTitle={pack.manifest.title} />
      <Outlet />
    </div>
  );
}
