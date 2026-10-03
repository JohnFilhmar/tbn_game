import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
