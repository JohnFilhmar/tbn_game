import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

/** One tool call the fake plugin received. */
export interface PluginCall {
  name: string;
  arguments: Record<string, unknown>;
  authorization: string | undefined;
}

/** A Model Context Protocol server over streamable HTTP with an `echo` tool, for tests. */
export interface FakeMcpServer {
  url: string;
  calls: PluginCall[];
  /** The bearer token it wants; requests without it get 401. */
  token: string;
  close(): Promise<void>;
}

function read_body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error('bad JSON'));
      }
    });
    request.on('error', reject);
  });
}

/** Starts the fake plugin on an ephemeral port. */
export async function start_fake_mcp_server(token = 'plugin-secret-token'): Promise<FakeMcpServer> {
  const calls: PluginCall[] = [];
  const http_server: Server = createServer((request, response: ServerResponse) => {
    void (async () => {
      if (request.headers['authorization'] !== `Bearer ${token}`) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end('{"error":"unauthorized"}');
        return;
      }
      const mcp = new McpServer({ name: 'fake_plugin', version: '1.0.0' });
      mcp.registerTool(
        'echo',
        {
          description: 'Echoes the text back, shouting when asked.',
          inputSchema: { text: z.string(), shout: z.boolean().optional() },
        },
        ({ text, shout }) => {
          calls.push({
            name: 'echo',
            arguments: { text, shout },
            authorization: request.headers['authorization'],
          });
          return {
            content: [{ type: 'text', text: shout === true ? text.toUpperCase() : text }],
          };
        },
      );
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      response.on('close', () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(request, response, await read_body(request));
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve) => http_server.listen(0, '127.0.0.1', resolve));
  const bound = http_server.address();
  if (bound === null || typeof bound === 'string') throw new Error('No port bound');
  return {
    url: `http://127.0.0.1:${bound.port}/mcp`,
    calls,
    token,
    close: async () => {
      http_server.closeAllConnections();
      await new Promise((resolve) => http_server.close(resolve));
    },
  };
}
