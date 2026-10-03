import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useWorldStore } from '@/game/world/worldStore';
import { ApiError } from '@/lib/api/apiError';
import { loadToken } from '@/lib/session/tokenStorage';
import { fakeApi } from '@/testing/fakeApi';
import { renderApp } from '@/testing/renderApp';

const SESSION = { token: 'tbn_new_session', expires_at: '2026-10-03T00:00:00.000Z' };

describe('signing in', () => {
  it('sends a signed-out owner to sign in, checks the fields before sending, then opens the desk', async () => {
    const api = fakeApi({
      'POST /auth/login': () => SESSION,
      'GET /agents': () => [],
      'GET /departments': () => [],
      'GET /tasks': () => [],
    });
    const { router } = renderApp({ api, path: '/tasks', isSignedIn: false });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/sign_in');

    await userEvent.type(screen.getByLabelText('Username'), 'Owner!');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('lowercase letters, digits and underscores')).toBeDefined();
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
    expect(api.calls.some((call) => call.path === '/auth/login')).toBe(false);

    await userEvent.clear(screen.getByLabelText('Username'));
    await userEvent.type(screen.getByLabelText('Username'), 'owner');
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/tasks');
    expect(loadToken()).toBe(SESSION.token);
    expect(api.calls.find((call) => call.path === '/auth/login')?.body).toEqual({
      username: 'owner',
      password: 'correct-horse-battery',
    });
  });

  it('signs in at the monitor with no world to draw, then the monitor shows the desk', async () => {
    const api = fakeApi({
      'POST /auth/login': () => SESSION,
      'GET /agents': () => [],
      'GET /departments': () => [],
    });
    useWorldStore.setState({ lastDesktopPath: '/agents' });
    const { router } = renderApp({ api, path: '/', isSignedIn: false });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeDefined();
    expect(
      screen.getByText('This device cannot draw the world. The desk still works.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Desk' })).toBeNull();

    await userEvent.type(screen.getByLabelText('Username'), 'owner');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('navigation', { name: 'Launcher' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/agents');
    expect(screen.queryByRole('button', { name: 'Desk' })).toBeNull();
  });

  it('shows the server reason when the account does not match', async () => {
    const api = fakeApi({
      'POST /auth/login': () => {
        throw new ApiError(401, 'Invalid username or password');
      },
    });
    renderApp({ api, path: '/sign_in', isSignedIn: false });
    await userEvent.type(await screen.findByLabelText('Username'), 'owner');
    await userEvent.type(screen.getByLabelText('Password'), 'not-the-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid username or password');
    expect(loadToken()).toBeNull();
  });
});
