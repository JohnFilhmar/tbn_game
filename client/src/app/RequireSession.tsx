import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/providers/SessionProvider';

/** Shows the desktop only to a signed-in owner; anyone else goes to sign in, and back after. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { token } = useSession();
  const location = useLocation();
  if (token === null) {
    return (
      <Navigate to="/sign_in" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return children;
}
