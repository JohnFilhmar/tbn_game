import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/providers/SessionProvider';

/**
 * Shows the desktop only to the signed-in owner or a guest; anyone else goes to sign in, and back
 * after.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { isSignedIn, isChecking } = useSession();
  const location = useLocation();
  if (isChecking) return null;
  if (!isSignedIn) {
    return (
      <Navigate to="/sign_in" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return children;
}
