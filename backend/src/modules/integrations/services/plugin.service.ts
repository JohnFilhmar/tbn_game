import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CreatePlugin, Plugin, PluginTool, UpdatePlugin } from '@tbn/contracts';
import { z } from 'zod';
import { SecretBoxService } from '@/lib/crypto/secret_box.service';
import {
  PLUGIN_REPOSITORY,
  type PluginRepository,
} from '@/modules/integrations/repositories/interface/integration_repository.interface';
import type { PluginRecord } from '@/modules/integrations/types/integration_records';

/** How long a plugin has to answer a listing or a call. */
const PLUGIN_TIMEOUT_MS = 30_000;

/** How much of a tool result reaches the model. */
const RESULT_CHARS = 16_000;

const ToolListSchema = z.array(
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.json()).optional(),
  }),
);

const ContentSchema = z.array(z.object({ type: z.string(), text: z.string().optional() }).loose());

/** Maps a plugin row to the API shape. The token never appears. */
export function to_plugin_view(record: PluginRecord): Plugin {
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    token_set: record.token_ciphertext !== null,
    enabled: record.enabled,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** Raised when a plugin cannot be reached or refuses. */
export class PluginError extends Error {
  constructor(
    readonly plugin: string,
    message: string,
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

/**
 * Plugins: Model Context Protocol servers over streamable HTTP, their sealed bearer tokens and
 * their attachments to agents. The worker lists a plugin's tools for an attached agent and calls
 * them; the token never leaves this service.
 */
@Injectable()
export class PluginService {
  private readonly logger = new Logger(PluginService.name);

  constructor(
    @Inject(PLUGIN_REPOSITORY) private readonly plugins: PluginRepository,
    private readonly secret_box: SecretBoxService,
  ) {}

  async list(owner_id: string): Promise<Plugin[]> {
    return (await this.plugins.list(owner_id)).map(to_plugin_view);
  }

  async get(owner_id: string, id: string): Promise<Plugin> {
    return to_plugin_view(await this.require(owner_id, id));
  }

  /** @throws ConflictException when the name is taken. */
  async create(owner_id: string, input: CreatePlugin): Promise<Plugin> {
    if ((await this.plugins.find_by_name(owner_id, input.name)) !== null) {
      throw new ConflictException('Plugin name is taken');
    }
    const record = await this.plugins.create(owner_id, {
      name: input.name,
      url: input.url,
      token_ciphertext: input.token === undefined ? null : this.secret_box.seal(input.token),
      enabled: input.enabled ?? true,
    });
    return to_plugin_view(record);
  }

  async update(owner_id: string, id: string, input: UpdatePlugin): Promise<Plugin> {
    if (input.name !== undefined) {
      const same_name = await this.plugins.find_by_name(owner_id, input.name);
      if (same_name !== null && same_name.id !== id) {
        throw new ConflictException('Plugin name is taken');
      }
    }
    const record = await this.plugins.update(owner_id, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.token !== undefined && { token_ciphertext: this.secret_box.seal(input.token) }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    });
    if (record === null) throw new NotFoundException('Plugin not found');
    return to_plugin_view(record);
  }

  async delete(owner_id: string, id: string): Promise<void> {
    if (!(await this.plugins.delete(owner_id, id))) throw new NotFoundException('Plugin not found');
  }

  async attach(owner_id: string, plugin_id: string, agent_id: string): Promise<Plugin> {
    const record = await this.require(owner_id, plugin_id);
    await this.plugins.attach(owner_id, plugin_id, agent_id);
    return to_plugin_view(record);
  }

  async detach(owner_id: string, plugin_id: string, agent_id: string): Promise<void> {
    await this.require(owner_id, plugin_id);
    if (!(await this.plugins.detach(owner_id, plugin_id, agent_id))) {
      throw new NotFoundException('The plugin is not attached to the agent');
    }
  }

  /** The enabled plugins attached to an agent, as rows, for its tools. */
  list_for_agent(owner_id: string, agent_id: string): Promise<PluginRecord[]> {
    return this.plugins.list_for_agent(owner_id, agent_id);
  }

  /** @throws NotFoundException when the plugin is missing. */
  async require(owner_id: string, id: string): Promise<PluginRecord> {
    const record = await this.plugins.find(owner_id, id);
    if (record === null) throw new NotFoundException('Plugin not found');
    return record;
  }

  /**
   * The tools the plugin offers.
   *
   * @throws PluginError when the plugin cannot be reached.
   */
  async list_tools(record: PluginRecord): Promise<PluginTool[]> {
    return this.with_client(record, async (client) => {
      const listed = await client.listTools(undefined, { timeout: PLUGIN_TIMEOUT_MS });
      return ToolListSchema.parse(listed.tools).map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        input_schema: tool.inputSchema ?? { type: 'object' },
      }));
    });
  }

  /**
   * Calls one tool and returns its text content, capped.
   *
   * @throws PluginError when the plugin cannot be reached or refuses the call.
   */
  async call_tool(
    record: PluginRecord,
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ text: string; is_error: boolean }> {
    return this.with_client(record, async (client) => {
      const result = await client.callTool({ name, arguments: input }, undefined, {
        timeout: PLUGIN_TIMEOUT_MS,
      });
      const content = ContentSchema.safeParse(result.content);
      const text = content.success
        ? content.data
            .map((block) => (block.type === 'text' ? (block.text ?? '') : `[${block.type}]`))
            .join('\n')
        : JSON.stringify(result.structuredContent ?? '');
      return {
        text:
          text.length > RESULT_CHARS
            ? `${text.slice(0, RESULT_CHARS)}\n... cut at ${RESULT_CHARS} characters`
            : text,
        is_error: result.isError === true,
      };
    });
  }

  private async with_client<T>(
    record: PluginRecord,
    work: (client: Client) => Promise<T>,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (record.token_ciphertext !== null) {
      headers['authorization'] = `Bearer ${this.secret_box.open(record.token_ciphertext)}`;
    }
    const client = new Client({ name: 'tbn', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(record.url), {
      requestInit: { headers },
    });
    try {
      await client.connect(transport, { timeout: PLUGIN_TIMEOUT_MS });
      return await work(client);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Plugin ${record.name} failed: ${message}`);
      throw new PluginError(record.name, message);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
