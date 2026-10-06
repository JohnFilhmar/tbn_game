import { useQueryClient } from '@tanstack/react-query';
import { GuestSchema, PrincipalSchema, SessionSchema, type Principal } from '@tbn/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createApiClient, newCommandId, type ApiClient } from '@/lib/api/apiClient';
import { clearToken, loadToken, saveToken } from '@/lib/session/tokenStorage';
import { useStreamStore } from '@/lib/stores/streamStore';

/** A guest signed in by the cookie an invite link set. */
export type GuestPrincipal = Extract<Principal, { kind: 'guest' }>;

/** The signed-in session and the API client that carries it. */
export interface SessionValue {
  api: ApiClient;
  /** The owner's session token, or null when the owner is signed out. */
  token: string | null;
  /** The signed-in guest, or null for the owner or nobody. */
  guest: GuestPrincipal | null;
  /** True for the owner or a guest. */
  isSignedIn: boolean;
  /** True while the client asks whether a guest cookie signs this browser in. */
  isChecking: boolean;
  /** Why the owner or guest was last signed out without asking, if they were. */
  notice: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  /** The guest picks their name. */
  nameGuest: (name: string) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** The server's address: empty for the page's own origin, or `VITE_API_URL` for the shells. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

/** Props of `SessionProvider`. */
export interface SessionProviderProps {
  children: ReactNode;
  /** The client to use instead of one built for `API_BASE_URL`; tests pass their own. */
  api?: ApiClient;
}

/**
 * Holds the owner's session token for this tab and the API client that sends it. The tab's session
 * storage is the token's one home, so the client always sends the current one. Without a token it
 * asks whether a guest cookie signs this browser in. A 401 from any call signs the owner or guest
 * out with the server's reason, and signing out forgets every cached row.
 */
export function SessionProvider({ children, api: given }: SessionProviderProps) {
  const queryClient = useQueryClient();
  const clearStreams = useStreamStore((state) => state.clear);
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [notice, setNotice] = useState<string | null>(null);
  const [guest, setGuest] = useState<GuestPrincipal | null>(null);
  const [isChecking, setIsChecking] = useState(token === null);

  const forget = useCallback(
    (reason: string | null) => {
      clearToken();
      setToken(null);
      setGuest(null);
      setNotice(reason);
      queryClient.clear();
      clearStreams();
    },
    [queryClient, clearStreams],
  );

  const api = useMemo(
    () =>
      given ??
      createApiClient({
        baseUrl: API_BASE_URL,
        getToken: loadToken,
        onUnauthorized: (message) => forget(`You were signed out: ${message}.`),
      }),
    [given, forget],
  );

  useEffect(() => {
    if (token !== null) return undefined;
    let isCurrent = true;
    void api.probe('/auth/me', PrincipalSchema).then((principal) => {
      if (!isCurrent) return;
      if (principal?.kind === 'guest') setGuest(principal);
      setIsChecking(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [api, token]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const session = await api.send('POST', '/auth/login', SessionSchema, {
        body: { username, password },
        commandId: newCommandId(),
      });
      saveToken(session.token);
      setNotice(null);
      setToken(session.token);
    },
    [api],
  );

  const signOut = useCallback(
    async (reason?: string) => {
      if (loadToken() !== null) {
        await api
          .sendNoContent('POST', '/auth/logout', { commandId: newCommandId() })
          .catch(() => undefined);
      }
      forget(reason ?? null);
    },
    [api, forget],
  );

  const nameGuest = useCallback(
    async (name: string) => {
      const named = await api.send('PATCH', '/guests/me', GuestSchema, {
        body: { name },
        commandId: newCommandId(),
      });
      setGuest((current) => (current === null ? null : { ...current, name: named.name }));
    },
    [api],
  );

  const isSignedIn = token !== null || guest !== null;
  const value = useMemo(
    () => ({ api, token, guest, isSignedIn, isChecking, notice, signIn, signOut, nameGuest }),
    [api, token, guest, isSignedIn, isChecking, notice, signIn, signOut, nameGuest],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

/** The session. Only valid inside `SessionProvider`. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession needs a SessionProvider');
  return value;
}

/** The API client of the session. */
export function useApi(): ApiClient {
  return useSession().api;
}
