type Listener = (...args: unknown[]) => void;
type AuthCallback = (data: unknown) => void;

/** What `io()` was given, as far as the tests read it. */
interface FakeOptions {
  auth?: (callback: AuthCallback) => void;
}

/**
 * A Socket.IO client that never touches the network. Tests play the server: they emit messages to
 * the client's listeners and read what it would send in its handshake.
 */
export class FakeSocket {
  readonly listeners = new Map<string, Listener[]>();
  connectCalls = 0;
  isClosed = false;

  constructor(
    readonly url: string,
    private readonly options: FakeOptions,
  ) {}

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  /** Delivers a message as the server would. */
  serverSends(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  /** What the client would send in its next handshake. */
  handshake(): unknown {
    let sent: unknown = undefined;
    this.options.auth?.((data) => {
      sent = data;
    });
    return sent;
  }

  connect(): this {
    this.connectCalls += 1;
    return this;
  }

  close(): this {
    this.isClosed = true;
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }
}

/** Every socket the code under test opened, in order. */
export const openedSockets: FakeSocket[] = [];

/** Stands in for `io` from `socket.io-client`. */
export function io(url: string, options: FakeOptions): FakeSocket {
  const socket = new FakeSocket(url, options);
  openedSockets.push(socket);
  return socket;
}
