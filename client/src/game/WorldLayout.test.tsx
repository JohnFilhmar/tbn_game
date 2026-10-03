import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { livePositions } from '@/game/world/livePositions';
import { useWorldStore } from '@/game/world/worldStore';
import { fakeApi } from '@/testing/fakeApi';
import { renderApp } from '@/testing/renderApp';

describe('the world layout', () => {
  it('lands the owner in the world with the HUD, without a canvas this device cannot draw', async () => {
    renderApp({
      api: fakeApi({ 'GET /agents': () => [], 'GET /departments': () => [] }),
      path: '/',
    });
    expect(await screen.findByRole('button', { name: 'Desk' })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Camera: third person/ })).toBeDefined();
    expect(
      screen.getByText('This device cannot draw the world. The desk still works.'),
    ).toBeDefined();
    expect(screen.getByRole('region', { name: 'What is happening' }).textContent).toContain(
      'Nobody is at work yet',
    );
    expect(screen.queryByRole('navigation', { name: 'Launcher' })).toBeNull();
  });

  it('opens the desk over the world and comes back to it', async () => {
    const { router } = renderApp({
      api: fakeApi({ 'GET /agents': () => [], 'GET /departments': () => [] }),
      path: '/agents',
    });
    expect(await screen.findByRole('navigation', { name: 'Launcher' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Desk' })).toBeNull();
    screen.getByRole('button', { name: 'World' }).click();
    expect(await screen.findByRole('button', { name: 'Desk' })).toBeDefined();
    expect(router.state.location.pathname).toBe('/');
  });

  describe('going to an agent', () => {
    afterEach(() => {
      livePositions.clear();
      useWorldStore.setState({ activities: {}, narration: [], teleport: null });
    });

    it('lists each agent with a way to go to it, by button or number key', async () => {
      renderApp({
        api: fakeApi({ 'GET /agents': () => [], 'GET /departments': () => [] }),
        path: '/',
      });
      await screen.findByRole('button', { name: 'Desk' });
      act(() => {
        livePositions.set('agent_1', new Vector3(3, 0, 4));
        useWorldStore.getState().setActivity('agent_1', 'working');
      });
      const go = await screen.findByRole('button', { name: 'Go to An agent' });
      expect(go.textContent).toContain('1');

      await userEvent.click(go);
      await waitFor(() => expect(useWorldStore.getState().teleport).not.toBeNull());
      const first = useWorldStore.getState().teleport;
      expect(first?.position.distanceTo(new Vector3(3, 0, 4))).toBeCloseTo(1.2);
      expect(screen.getByRole('list', { name: 'What happened' }).textContent).toContain(
        'You go to An agent.',
      );

      await userEvent.keyboard('1');
      await waitFor(() => expect(useWorldStore.getState().teleport?.id).toBe((first?.id ?? 0) + 1));
    });
  });
});
