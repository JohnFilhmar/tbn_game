import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Department } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '@/testing/fakeApi';
import { agentFixture } from '@/testing/fixtures';
import { renderApp } from '@/testing/renderApp';

const AT = '2026-10-02T12:00:00.000Z';
const GUEST = {
  kind: 'guest',
  id: '00000000-0000-4000-8000-0000000000bb',
  name: 'Mika',
  owner_username: 'john',
};

describe('the desk for a guest', () => {
  it('shows everything a guest may read, and nothing that changes it', async () => {
    const manager = agentFixture({ name: 'ada' });
    const department: Department = {
      id: manager.department_id,
      name: 'Research',
      manager_agent_id: manager.id,
      member_count: 1,
      created_at: AT,
      updated_at: AT,
    };
    const api = fakeApi({
      'GET /auth/me': () => GUEST,
      'GET /departments': () => [department],
      'GET /agents': () => [manager],
    });
    renderApp({ api, path: '/departments', isSignedIn: false });

    expect((await screen.findByRole('note')).textContent).toContain('You are a guest here');
    const launcher = screen.getByRole('navigation', { name: 'Launcher' });
    expect(within(launcher).queryByRole('link', { name: 'Providers' })).toBeNull();
    expect(within(launcher).queryByRole('link', { name: 'Guests' })).toBeNull();
    expect(within(launcher).getByRole('link', { name: 'Tasks' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();

    const table = await screen.findByRole('table', { name: 'Departments' });
    await userEvent.click(within(table).getByRole('button', { name: 'Rename Research' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename Research' });
    expect(within(dialog).getByRole('button', { name: 'Rename' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(api.calls.some((call) => call.method !== 'GET')).toBe(false);
  });
});
