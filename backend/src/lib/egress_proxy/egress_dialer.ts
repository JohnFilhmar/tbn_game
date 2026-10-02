import { lookup } from 'node:dns/promises';
import { connect, type Socket } from 'node:net';

/** Injection token for the dialer the proxy opens connections with. Tests swap it. */
export const EGRESS_DIALER = Symbol('EGRESS_DIALER');

/** Resolves names and opens TCP connections, the two steps the address policy sits between. */
export interface EgressDialer {
  /** Every address a name resolves to. The policy refuses the destination when any is private. */
  resolve(host: string): Promise<string[]>;
  /** Opens a connection to one resolved address, never to the name again. */
  open(address: string, port: number): Promise<Socket>;
}

/** How long a TCP connect may take. */
const CONNECT_TIMEOUT_MS = 10_000;

/** The dialer of the running proxy: the system resolver and plain TCP. */
export function system_dialer(): EgressDialer {
  return {
    resolve: async (host) => (await lookup(host, { all: true })).map((entry) => entry.address),
    open: (address, port) =>
      new Promise((resolve, reject) => {
        const socket = connect({ host: address, port });
        socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
          socket.destroy(new Error(`Connecting to ${address}:${port} timed out`));
        });
        socket.once('error', reject);
        socket.once('connect', () => {
          socket.setTimeout(0);
          socket.off('error', reject);
          resolve(socket);
        });
      }),
  };
}
