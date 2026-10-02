import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Button } from '@/components/Button';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection, useMe } from '@/lib/data/queries';
import { cx } from '@/lib/ui/cx';
import { useSession } from '@/providers/SessionProvider';
import { ConnectionLight } from './ConnectionLight';
import { LAUNCHER } from './launcher';

function usePendingApprovals(): number {
  const { data } = useCollection(COLLECTIONS.approvals);
  return data?.filter((approval) => approval.status === 'pending').length ?? 0;
}

/**
 * The virtual desktop: the launcher on the left, the bar with the live light and the owner on
 * top, and the open screen. On a narrow screen the launcher folds behind a menu button.
 */
export function DesktopLayout() {
  const { signOut } = useSession();
  const { data: me } = useMe();
  const pendingApprovals = usePendingApprovals();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 dark:bg-slate-900"
      >
        Skip to the screen
      </a>
      <nav
        id="launcher"
        aria-label="Launcher"
        className={cx(
          'w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900',
          isMenuOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden md:flex',
        )}
      >
        <p className="text-lg font-semibold tracking-tight">tbn desk</p>
        {LAUNCHER.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <h2 className="px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {section.title}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setIsMenuOpen(false)}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
                        isActive
                          ? 'bg-teal-50 font-medium text-teal-900 dark:bg-teal-950 dark:text-teal-200'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                      )
                    }
                  >
                    {item.label}
                    {item.to === '/approvals' && pendingApprovals > 0 && (
                      <span className="rounded-full bg-amber-500 px-2 text-xs font-semibold text-slate-950">
                        {pendingApprovals}
                        <span className="sr-only"> waiting</span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {isMenuOpen && (
        <button
          type="button"
          aria-label="Close the launcher"
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-expanded={isMenuOpen}
            aria-controls="launcher"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            Menu
          </Button>
          <ConnectionLight />
          <div className="ml-auto flex items-center gap-3">
            {me !== undefined && (
              <span className="text-sm text-slate-600 dark:text-slate-400">{me.username}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
