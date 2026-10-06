import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Guest, GuestInvite } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '@/testing/fakeApi';
import { renderApp } from '@/testing/renderApp';

const AT = '2026-10-06T12:00:00.000Z';
const MIKA: Guest = {
  id: '00000000-0000-4000-8000-0000000000bb',
  name: 'Mika',
  last_seen_at: AT,
  revoked_at: null,
  created_at: AT,
};

describe('the guests screen', () => {
  it('creates a link to send once, and revokes a guest', async () => {
    const invite: GuestInvite = {
      id: '00000000-0000-4000-8000-0000000000cc',
      label: 'Bo',
      guest_id: null,
      expires_at: AT,
      redeemed_at: null,
      created_at: AT,
    };
    const api = fakeApi({
      'GET /guests': () => [MIKA],
      'GET /guests/invites': () => [],
      'GET /providers': () => [],
      'POST /guests/invites': () => ({ invite, path: '/invite/tbi_secret' }),
      [`POST /guests/${MIKA.id}/revoke`]: () => ({ ...MIKA, revoked_at: AT }),
    });
    renderApp({ api, path: '/guests' });

    await userEvent.type(
      await screen.findByLabelText('Who is it for', {}, { timeout: 5_000 }),
      'Bo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
    const link = await screen.findByLabelText('Invite link');
    expect(link.getAttribute('value')).toBe(`${window.location.origin}/invite/tbi_secret`);
    expect(
      api.calls.find((call) => call.method === 'POST' && call.path === '/guests/invites')?.body,
    ).toEqual({
      label: 'Bo',
    });

    const table = await screen.findByRole('table', { name: 'Your guests' });
    await userEvent.click(within(table).getByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke Mika?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(api.calls.some((call) => call.path === `/guests/${MIKA.id}/revoke`)).toBe(true);
  });
});
