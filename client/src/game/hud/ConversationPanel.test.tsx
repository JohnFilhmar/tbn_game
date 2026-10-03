import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { livePositions, OWNER_KEY } from '@/game/world/livePositions';
import { useWorldStore } from '@/game/world/worldStore';
import { fakeApi } from '@/testing/fakeApi';
import { openedSockets } from '@/testing/fakeSocket';
import {
  agentFixture,
  assistantEntry,
  chunkFixture,
  fixtureId,
  ownerMessage,
} from '@/testing/fixtures';
import { renderApp } from '@/testing/renderApp';

const ADA = agentFixture({ name: 'Ada' });

afterEach(() => {
  livePositions.clear();
  useWorldStore.setState({ activities: {}, narration: [], talkingTo: null, teleport: null });
});

describe('talking to an agent in the world', () => {
  it('opens its session beside the world, sends a message, shows the reply and closes', async () => {
    const api = fakeApi({
      'GET /agents': () => [ADA],
      'GET /departments': () => [],
      'GET /tasks': () => [],
      'GET /runs': () => [],
      [`GET /agents/${ADA.id}/transcript`]: () => [assistantEntry(ADA.id, 1, 'Morning, boss.')],
      [`POST /agents/${ADA.id}/messages`]: () => ownerMessage(ADA.id, 2, 'How is it going?'),
    });
    renderApp({ api, path: '/' });
    await screen.findByRole('button', { name: 'Desk' });
    act(() => {
      livePositions.set(OWNER_KEY, new Vector3(0, 0, 0));
      livePositions.set(ADA.id, new Vector3(0, 0, 1.5));
      useWorldStore.getState().setActivity(ADA.id, 'at_desk');
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Talk to Ada' }));
    const panel = await screen.findByRole('complementary', { name: 'Conversation with Ada' });
    expect(useWorldStore.getState().talkingTo).toBe(ADA.id);
    expect(await within(panel).findByText('Morning, boss.')).toBeDefined();
    const box = screen.getByLabelText('Message to Ada');
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(screen.queryByRole('region', { name: 'What is happening' })).toBeNull();

    await userEvent.type(box, 'How is it going?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(api.calls.find((call) => call.path === `/agents/${ADA.id}/messages`)?.body).toEqual({
        text: 'How is it going?',
      }),
    );

    act(() => {
      openedSockets
        .at(-1)
        ?.serverSends(
          'stream',
          chunkFixture({
            agent_id: ADA.id,
            run_id: fixtureId(),
            call_id: fixtureId(),
            text: 'Going well',
          }),
        );
    });
    await waitFor(() => expect(panel.textContent).toContain('Going well'));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(useWorldStore.getState().talkingTo).toBeNull());
    expect(screen.queryByRole('complementary', { name: 'Conversation with Ada' })).toBeNull();
    expect(screen.getByRole('region', { name: 'What is happening' })).toBeDefined();
  });
});
