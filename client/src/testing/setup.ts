import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { clearToken } from '@/lib/session/tokenStorage';
import { openedSockets } from './fakeSocket';

// No test reaches a real gateway; the fake lets a test play the server.
vi.mock('socket.io-client', () => import('./fakeSocket'));

afterEach(() => {
  cleanup();
  clearToken();
  window.sessionStorage.clear();
  openedSockets.length = 0;
});
