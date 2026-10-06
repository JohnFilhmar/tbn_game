import type { ChangeEvent } from '@tbn/contracts';
import { describe, expect, it, vi } from 'vitest';
import { openedSockets, type FakeSocket } from '@/testing/fakeSocket';
import { agentChange, agentFixture } from '@/testing/fixtures';
import {
  connectRealtime,
  type ConnectionStatus,
  type RealtimeHandlers,
} from './realtimeConnection';

function connect() {
  const statuses: ConnectionStatus[] = [];
  const handlers: RealtimeHandlers = {
    onChanges: vi.fn<(events: ChangeEvent[]) => void>(),
    onStream: vi.fn(),
    onResync: vi.fn(),
    onStatus: (status) => statuses.push(status),
    onUnauthorized: vi.fn(),
    onPlayers: vi.fn(),
    onPlayer: vi.fn(),
    onPlayerGone: vi.fn(),
    onCue: vi.fn(),
  };
  const connection = connectRealtime({ baseUrl: 'http://server', token: 'tbn_token', handlers });
  const socket: FakeSocket | undefined = openedSockets.at(-1);
  if (socket === undefined) throw new Error('No socket was opened');
  return { connection, socket, handlers, statuses };
}

describe('the realtime connection', () => {
  it('sends the token without a cursor first, then resumes after the last change applied', () => {
    const { socket, handlers, statuses } = connect();
    expect(socket.url).toBe('http://server');
    expect(socket.handshake()).toEqual({ token: 'tbn_token', cursor: null });

    socket.serverSends('hello', { head_seq: 4, cursor: 4 });
    expect(statuses).toEqual(['connecting', 'live']);

    const agent = agentFixture();
    socket.serverSends('changes', [
      agentChange(agent.id, 'update', agent, 4),
      agentChange(agent.id, 'update', agent, 5),
    ]);
    expect(handlers.onChanges).toHaveBeenCalledTimes(1);
    expect(vi.mocked(handlers.onChanges).mock.calls[0]?.[0].map((event) => event.seq)).toEqual([5]);
    expect(socket.handshake()).toEqual({ token: 'tbn_token', cursor: 5 });

    socket.serverSends('changes', [agentChange(agent.id, 'update', agent, 5)]);
    expect(handlers.onChanges).toHaveBeenCalledTimes(1);
  });

  it('asks for a reload when the log cannot fill the gap, and ignores what it cannot read', () => {
    const { socket, handlers } = connect();
    socket.serverSends('resync_required', { head_seq: 90, oldest_seq: 40 });
    expect(handlers.onResync).toHaveBeenCalledWith({ head_seq: 90, oldest_seq: 40 });
    socket.serverSends('changes', [{ not: 'an event' }]);
    socket.serverSends('resync_required', 'nonsense');
    expect(handlers.onChanges).not.toHaveBeenCalled();
    expect(handlers.onResync).toHaveBeenCalledTimes(1);
  });

  it('reconnects after the server closes the socket, and gives up when the token is refused', () => {
    const { socket, handlers, statuses } = connect();
    socket.serverSends('disconnect', 'io server disconnect');
    expect(socket.connectCalls).toBe(1);
    expect(statuses.at(-1)).toBe('reconnecting');

    socket.serverSends('connect_error', new Error('unauthorized'));
    expect(handlers.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(socket.isClosed).toBe(true);
    expect(statuses.at(-1)).toBe('offline');
  });

  it('closes for good when the owner leaves', () => {
    const { connection, socket, statuses } = connect();
    connection.close();
    expect(socket.isClosed).toBe(true);
    expect(socket.listeners.size).toBe(0);
    expect(statuses.at(-1)).toBe('offline');
  });
});
