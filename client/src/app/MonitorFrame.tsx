import type { ReactNode } from 'react';
import { useWorldStore } from '@/game/world/worldStore';
import { cx } from '@/lib/ui/cx';

/** Props of `MonitorFrame`. */
export interface MonitorFrameProps {
  children: ReactNode;
}

/**
 * The bezel of the owner's monitor, over the world's own monitor while the owner is seated: the
 * camera looks at the screen from the chair, and the screen's content is real DOM in this frame,
 * so fields, autofill, focus and screen readers work as on any page. The world shows around it.
 * It powers on when the owner sits down, and is simply there after a reload.
 */
export function MonitorFrame({ children }: MonitorFrameProps) {
  const isGliding = useWorldStore((state) => state.isGliding);
  return (
    <div className="fixed inset-0 z-20 flex p-1 sm:p-3 lg:px-10 lg:py-6">
      <div
        className={cx(
          'flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border-2 border-slate-600 bg-slate-800 p-1.5 shadow-chunk sm:p-2.5',
          isGliding && 'motion-safe:animate-power-on',
        )}
      >
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          {children}
        </div>
        <div
          aria-hidden="true"
          className="flex items-center justify-between px-2 pt-1 font-display text-xs font-semibold tracking-widest text-slate-400 uppercase sm:pt-1.5"
        >
          <span>tbn</span>
          <span className="size-2 rounded-full bg-emerald-400 shadow-glow" />
        </div>
      </div>
    </div>
  );
}
