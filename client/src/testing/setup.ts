import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { clearToken } from '@/lib/session/tokenStorage';
import { openedSockets } from './fakeSocket';

// No test reaches a real gateway; the fake lets a test play the server.
vi.mock('socket.io-client', () => import('./fakeSocket'));

// jsdom has no WebGL, so the world shows its fallback; the stub keeps jsdom from logging that.
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
  clearToken();
  window.sessionStorage.clear();
  openedSockets.length = 0;
});
