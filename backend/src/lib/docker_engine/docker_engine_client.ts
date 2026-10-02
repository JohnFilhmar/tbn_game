import { request as http_request, type IncomingMessage } from 'node:http';
import { z } from 'zod';
import type { ContainerCreateRequest, ContainerSummary, DemuxedLogs } from './docker_engine_types';

/** The Engine API version this client speaks. Volume subpath mounts need 1.45 or newer. */
const API_VERSION = 'v1.45';

/** Replies that carry a message, for errors. */
const MessageSchema = z.object({ message: z.string() });

const CreateReplySchema = z.object({ Id: z.string().min(1) });

const WaitReplySchema = z.object({ StatusCode: z.number().int() });

const ContainerSummarySchema = z.object({
  Id: z.string(),
  Names: z.array(z.string()),
  State: z.string(),
  Labels: z.record(z.string(), z.string()).default({}),
});

const NetworkInspectSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  Internal: z.boolean().default(false),
  IPAM: z.object({
    Config: z.array(z.object({ Subnet: z.string().optional(), Gateway: z.string().optional() })),
  }),
});

/** Raised when the Engine API answers with an error status. */
export class DockerEngineError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DockerEngineError';
  }
}

interface EngineReply {
  status: number;
  body: Buffer;
}

/** The address of a network as the engine reports it. */
export interface NetworkAddress {
  id: string;
  name: string;
  internal: boolean;
  subnet: string | null;
  gateway: string | null;
}

/**
 * The smallest Docker Engine client the launcher needs, over the unix socket: create, start, wait,
 * kill, remove and read the logs of a container, list containers by label, and inspect images and
 * networks. No dependency: the API is plain HTTP and JSON.
 */
export class DockerEngineClient {
  constructor(private readonly socket_path: string) {}

  /** True when the engine answers. */
  async ping(): Promise<boolean> {
    try {
      const reply = await this.call('GET', '/_ping');
      return reply.status === 200;
    } catch {
      return false;
    }
  }

  /** True when the image is present on the host. */
  async has_image(reference: string): Promise<boolean> {
    const reply = await this.call('GET', `/images/${encodeURIComponent(reference)}/json`);
    return reply.status === 200;
  }

  /** Whether a network is internal, and its subnet and gateway. Null when it does not exist. */
  async inspect_network(name: string): Promise<NetworkAddress | null> {
    const reply = await this.call('GET', `/networks/${encodeURIComponent(name)}`);
    if (reply.status === 404) return null;
    const parsed = NetworkInspectSchema.parse(this.json_of(reply));
    const config = parsed.IPAM.Config[0];
    return {
      id: parsed.Id,
      name: parsed.Name,
      internal: parsed.Internal,
      subnet: config?.Subnet ?? null,
      gateway: config?.Gateway ?? null,
    };
  }

  /**
   * Creates a network when none of that name exists. An internal network is also isolated from
   * the host: without the isolated gateway mode, containers on it still reach the host's own
   * address on the bridge. The compose files create the sandbox network the same way.
   */
  async ensure_network(name: string, internal: boolean): Promise<void> {
    if ((await this.inspect_network(name)) !== null) return;
    this.json_of(
      await this.call('POST', '/networks/create', {
        Name: name,
        Driver: 'bridge',
        Internal: internal,
        Options: internal ? { 'com.docker.network.bridge.gateway_mode_ipv4': 'isolated' } : {},
      }),
    );
  }

  /** Creates a container and returns its id. */
  async create_container(name: string, request: ContainerCreateRequest): Promise<string> {
    const reply = await this.call(
      'POST',
      `/containers/create?name=${encodeURIComponent(name)}`,
      request,
    );
    return CreateReplySchema.parse(this.json_of(reply)).Id;
  }

  async start_container(id: string): Promise<void> {
    this.json_of(await this.call('POST', `/containers/${id}/start`));
  }

  /** Blocks until the container stops and returns its exit code. */
  async wait_container(id: string): Promise<number> {
    const reply = await this.call('POST', `/containers/${id}/wait?condition=not-running`);
    return WaitReplySchema.parse(this.json_of(reply)).StatusCode;
  }

  /** Sends SIGKILL. A container that already stopped is not an error. */
  async kill_container(id: string): Promise<void> {
    const reply = await this.call('POST', `/containers/${id}/kill?signal=SIGKILL`);
    if (reply.status >= 400 && reply.status !== 404 && reply.status !== 409) {
      throw new DockerEngineError(reply.status, this.message_of(reply));
    }
  }

  /** Removes a container, with its anonymous volumes, even while it runs. */
  async remove_container(id: string): Promise<void> {
    const reply = await this.call('DELETE', `/containers/${id}?force=true&v=true`);
    if (reply.status >= 400 && reply.status !== 404) {
      throw new DockerEngineError(reply.status, this.message_of(reply));
    }
  }

  /** The container's stdout and stderr, demultiplexed from the engine's framed stream. */
  async container_logs(id: string): Promise<DemuxedLogs> {
    const reply = await this.call('GET', `/containers/${id}/logs?stdout=true&stderr=true`);
    if (reply.status >= 400) throw new DockerEngineError(reply.status, this.message_of(reply));
    return demux_logs(reply.body);
  }

  /** Every container, running or not, carrying the label. */
  async containers_with_label(label: string): Promise<ContainerSummary[]> {
    const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
    const reply = await this.call('GET', `/containers/json?all=true&filters=${filters}`);
    return z
      .array(ContainerSummarySchema)
      .parse(this.json_of(reply))
      .map((item) => ({
        id: item.Id,
        name: item.Names[0] ?? '',
        state: item.State,
        labels: item.Labels,
      }));
  }

  private json_of(reply: EngineReply): unknown {
    if (reply.status >= 400) throw new DockerEngineError(reply.status, this.message_of(reply));
    if (reply.body.length === 0) return null;
    return JSON.parse(reply.body.toString('utf8'));
  }

  private message_of(reply: EngineReply): string {
    try {
      return MessageSchema.parse(JSON.parse(reply.body.toString('utf8'))).message;
    } catch {
      return `Docker Engine answered ${reply.status}`;
    }
  }

  private call(method: string, path: string, body?: unknown): Promise<EngineReply> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http_request(
        {
          socketPath: this.socket_path,
          method,
          path: `/${API_VERSION}${path}`,
          headers: {
            Host: 'docker',
            ...(payload !== undefined && {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }),
          },
        },
        (response: IncomingMessage) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) }),
          );
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      if (payload !== undefined) request.write(payload);
      request.end();
    });
  }
}

/**
 * Splits the engine's multiplexed log stream into stdout and stderr. Each frame is an 8 byte
 * header, stream type in the first byte and a big-endian length in the last four, then the bytes.
 */
export function demux_logs(stream: Buffer): DemuxedLogs {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= stream.length) {
    const kind = stream[offset];
    const length = stream.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + length, stream.length);
    const frame = stream.subarray(start, end);
    (kind === 2 ? stderr : stdout).push(frame);
    offset = end;
  }
  return { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}
