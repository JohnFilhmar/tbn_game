import { createServer, type IncomingMessage, type Server } from 'node:http';

/** One request the fake webhook received. */
export interface WebhookRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

/** A server that records what integrations send it and answers as told. */
export interface FakeWebhookServer {
  base_url: string;
  requests: WebhookRequest[];
  /** The status of the next answers; 0 restores 200. */
  answer_with(status: number): void;
  close(): Promise<void>;
}

/** Starts the webhook on an ephemeral port. */
export async function start_fake_webhook_server(): Promise<FakeWebhookServer> {
  const requests: WebhookRequest[] = [];
  let status = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.writeHead(status === 0 ? 200 : status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: status === 0, received: requests.length }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const bound = server.address();
  if (bound === null || typeof bound === 'string') throw new Error('No port bound');
  return {
    base_url: `http://127.0.0.1:${bound.port}`,
    requests,
    answer_with: (next) => {
      status = next;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
