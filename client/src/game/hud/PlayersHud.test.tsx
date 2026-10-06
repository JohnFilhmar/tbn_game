import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerMessage } from '@tbn/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { usePlayerUiStore } from '@/game/players/playerUiStore';
import { useWorldStore } from '@/game/world/worldStore';
import { applyChanges } from '@/lib/realtime/applyChanges';
import { publishChanges } from '@/lib/realtime/changeFeed';
import { usePlayersStore } from '@/lib/stores/playersStore';
import { fakeApi } from '@/testing/fakeApi';
import { renderApp } from '@/testing/renderApp';

const OWNER_ID = '00000000-0000-4000-8000-0000000000aa';
const MIKA_ID = '00000000-0000-4000-8000-0000000000bb';
const AT = '2026-10-06T12:00:00.000Z';
const WORLD_ROUTES = {
  'GET /agents': () => [],
  'GET /departments': () => [],
  'GET /tasks': () => [],
  'GET /runs': () => [],
};

afterEach(() => {
  usePlayerUiStore.setState({ chatWith: null, notices: [], nearPlayerId: null });
  usePlayersStore.getState().clear();
  useWorldStore.setState({ narration: [], talkingTo: null });
});

describe('the other players in the world', () => {
  it('pops up a message, which opens the conversation and marks it read', async () => {
    const message: PlayerMessage = {
      id: '00000000-0000-4000-8000-0000000000cc',
      from_id: MIKA_ID,
      from_name: 'Mika',
      to_id: OWNER_ID,
      text: 'Come see the board!',
      read_at: null,
      created_at: AT,
    };
    let inbox: PlayerMessage[] = [];
    const api = fakeApi({
      ...WORLD_ROUTES,
      'GET /player_messages': () => inbox,
      'POST /player_messages/read': () => null,
    });
    const { queryClient } = renderApp({ api, path: '/' });
    await screen.findByRole('button', { name: 'Desk' });
    // The notices listen once they know who you are and have read your messages.
    await waitFor(() =>
      expect(api.calls.some((call) => call.path === '/player_messages')).toBe(true),
    );
    act(() => {
      usePlayersStore.getState().upsert({
        id: MIKA_ID,
        kind: 'guest',
        name: 'Mika',
        pose: null,
        online: true,
        offline_at: null,
      });
      inbox = [message];
      // As the realtime provider does: the cache first, then the world's feed.
      const events = [
        {
          seq: 1,
          entity: 'player_message' as const,
          id: message.id,
          op: 'insert' as const,
          changed: null,
          data: message,
          at: AT,
        },
      ];
      applyChanges(queryClient, events);
      publishChanges(events);
    });

    await userEvent.click(await screen.findByRole('button', { name: /Mika sent you a message/ }));
    const panel = await screen.findByRole('complementary', { name: 'Conversation with Mika' });
    expect(await within(panel).findByText('Come see the board!')).toBeDefined();
    await waitFor(() =>
      expect(api.calls.some((call) => call.path === '/player_messages/read')).toBe(true),
    );
    expect(usePlayerUiStore.getState().notices).toEqual([]);
  });

  it('puts you back at the entrance with U', async () => {
    renderApp({ api: fakeApi(WORLD_ROUTES), path: '/' });
    await screen.findByRole('button', { name: 'Desk' });
    const before = usePlayerUiStore.getState().unstuckId;
    await userEvent.keyboard('u');
    expect(usePlayerUiStore.getState().unstuckId).toBe(before + 1);
  });

  it('asks a new guest for a name, and never offers them build mode', async () => {
    let name: string | null = null;
    const api = fakeApi({
      ...WORLD_ROUTES,
      'GET /auth/me': () => ({ kind: 'guest', id: MIKA_ID, name, owner_username: 'john' }),
      'GET /player_messages': () => [],
      'PATCH /guests/me': () => {
        name = 'Mika';
        return { id: MIKA_ID, name, last_seen_at: AT, revoked_at: null, created_at: AT };
      },
    });
    renderApp({ api, path: '/', isSignedIn: false });
    const dialog = await screen.findByRole('dialog', { name: "Welcome to john's company" });
    await userEvent.type(within(dialog).getByLabelText('Your name'), 'Mika');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enter the world' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Desk' })).toBeDefined();
  });
});
