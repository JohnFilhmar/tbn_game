import { LoginRequestSchema } from '@tbn/contracts';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/Button';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { MonitorFrame } from '@/app/MonitorFrame';
import { isSeatedPath } from '@/game/world/seat';
import { useWorldStore } from '@/game/world/worldStore';
import { useForm } from '@/lib/forms/useForm';
import { useSession } from '@/providers/SessionProvider';

const ReturnStateSchema = z.object({ from: z.string().startsWith('/') });

/**
 * Where to go after signing in: the desk screen the owner was sent away from, or `deskPath`. The
 * owner is already seated at the monitor, so signing in never leaves it for the world.
 */
function returnPath(state: unknown, deskPath: string): string {
  const parsed = ReturnStateSchema.safeParse(state);
  if (!parsed.success || !isSeatedPath(parsed.data.from) || parsed.data.from === '/sign_in') {
    return deskPath;
  }
  return parsed.data.from;
}

/** The owner signs in with the account made on the server. */
export function SignInScreen() {
  const { isSignedIn, notice, signIn } = useSession();
  const location = useLocation();
  const lastDesktopPath = useWorldStore((state) => state.lastDesktopPath);
  const target = returnPath(location.state, lastDesktopPath);
  const form = useForm({
    initial: { username: '', password: '' },
    schema: LoginRequestSchema,
    toInput: (draft) => ({ username: draft.username.trim(), password: draft.password }),
    // A session makes this screen redirect to the target below.
    onSubmit: (body) => signIn(body.username, body.password),
  });

  if (isSignedIn) return <Navigate to={target} replace />;

  return (
    <MonitorFrame>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-4">
        <p
          aria-hidden="true"
          className="font-display text-5xl font-bold tracking-widest text-teal-700 uppercase dark:text-teal-400"
        >
          tbn
        </p>
        <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border-2 border-slate-200 bg-white p-6 shadow-chunk dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Sign in</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              The desk of your company. Use the owner account made on the server.
            </p>
          </div>
          {notice !== null && (
            <p
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
            >
              {notice}
            </p>
          )}
          <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
            <TextField
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={form.draft.username}
              onChange={(value) => form.setField('username', value)}
              error={form.errors['username']}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={form.draft.password}
              onChange={(value) => form.setField('password', value)}
              error={form.errors['password']}
            />
            <FormError message={form.errors['']} />
            <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
              Sign in
            </Button>
          </form>
        </div>
      </main>
    </MonitorFrame>
  );
}
