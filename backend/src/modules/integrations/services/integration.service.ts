import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationPlaceholderSchema,
  TOKEN_PLACEHOLDER,
  integration_template_problem,
  type CreateIntegration,
  type Integration,
  type IntegrationCallResult,
  type IntegrationPlaceholder,
  type PlaceholderValues,
  type UpdateIntegration,
} from '@tbn/contracts';
import { z } from 'zod';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { SecretBoxService } from '@/lib/crypto/secret_box.service';
import {
  INTEGRATION_REPOSITORY,
  type IntegrationRepository,
} from '@/modules/integrations/repositories/interface/integration_repository.interface';
import type { IntegrationRecord } from '@/modules/integrations/types/integration_records';
import { body_content_type, body_escaping, render_template } from './template_renderer';

/** How much of a response the caller sees. */
const EXCERPT_CHARS = 2_000;

const HeadersSchema = z.record(z.string(), z.string());
const PlaceholdersSchema = z.array(IntegrationPlaceholderSchema);

/** The declared placeholders of a row, parsed. */
export function placeholders_of(record: IntegrationRecord): IntegrationPlaceholder[] {
  const parsed = PlaceholdersSchema.safeParse(record.placeholders);
  return parsed.success ? parsed.data : [];
}

function headers_of(record: IntegrationRecord): Record<string, string> {
  const parsed = HeadersSchema.safeParse(record.headers);
  return parsed.success ? parsed.data : {};
}

/** Maps an integration row to the API shape. The token never appears. */
export function to_integration_view(record: IntegrationRecord): Integration {
  return {
    id: record.id,
    name: record.name,
    method: record.method,
    url: record.url,
    headers: headers_of(record),
    token_set: record.token_ciphertext !== null,
    body_format: record.body_format,
    body_template: record.body_template,
    placeholders: placeholders_of(record),
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

/** A rendered request, ready to send or to show. */
export interface RenderedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/**
 * Request templates the owner defines, their sealed tokens, and the calls made from them: by an
 * agent through its `call_<integration>` tool, by a notification channel, or by the owner's test.
 * Calls go direct from the worker, not through the proxy: the URL is the owner's.
 */
@Injectable()
export class IntegrationService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(INTEGRATION_REPOSITORY) private readonly integrations: IntegrationRepository,
    private readonly secret_box: SecretBoxService,
  ) {}

  async list(owner_id: string): Promise<Integration[]> {
    return (await this.integrations.list(owner_id)).map(to_integration_view);
  }

  async get(owner_id: string, id: string): Promise<Integration> {
    return to_integration_view(await this.require(owner_id, id));
  }

  /** @throws ConflictException when the name is taken. */
  async create(owner_id: string, input: CreateIntegration): Promise<Integration> {
    if ((await this.integrations.find_by_name(owner_id, input.name)) !== null) {
      throw new ConflictException('Integration name is taken');
    }
    const record = await this.integrations.create(owner_id, {
      name: input.name,
      method: input.method,
      url: input.url,
      headers: input.headers ?? {},
      token_ciphertext: input.token === undefined ? null : this.secret_box.seal(input.token),
      body_format: input.body_format ?? 'none',
      body_template: input.body_template ?? null,
      placeholders: input.placeholders ?? [],
    });
    return to_integration_view(record);
  }

  /** Edits an integration. The templates are checked together after the merge. */
  async update(owner_id: string, id: string, input: UpdateIntegration): Promise<Integration> {
    const current = await this.require(owner_id, id);
    if (input.name !== undefined) {
      const same_name = await this.integrations.find_by_name(owner_id, input.name);
      if (same_name !== null && same_name.id !== id) {
        throw new ConflictException('Integration name is taken');
      }
    }
    const problem = integration_template_problem({
      url: input.url ?? current.url,
      headers: input.headers ?? headers_of(current),
      body_template:
        input.body_template === undefined ? current.body_template : input.body_template,
      placeholders: input.placeholders ?? placeholders_of(current),
    });
    if (problem !== null) throw new BadRequestException(`placeholders: ${problem}`);
    const record = await this.integrations.update(owner_id, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.method !== undefined && { method: input.method }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.headers !== undefined && { headers: input.headers }),
      ...(input.token !== undefined && { token_ciphertext: this.secret_box.seal(input.token) }),
      ...(input.body_format !== undefined && { body_format: input.body_format }),
      ...(input.body_template !== undefined && { body_template: input.body_template }),
      ...(input.placeholders !== undefined && { placeholders: input.placeholders }),
    });
    if (record === null) throw new NotFoundException('Integration not found');
    return to_integration_view(record);
  }

  async delete(owner_id: string, id: string): Promise<void> {
    if (!(await this.integrations.delete(owner_id, id))) {
      throw new NotFoundException('Integration not found');
    }
  }

  /** The owner's test: a call with sample values. */
  async test(
    owner_id: string,
    id: string,
    values: PlaceholderValues,
  ): Promise<IntegrationCallResult> {
    const record = await this.require(owner_id, id);
    const missing = this.missing_required(record, values);
    if (missing.length > 0) {
      throw new BadRequestException(`values: missing ${missing.join(', ')}`);
    }
    return this.call(record, values);
  }

  /** Attaches an integration to an agent as a tool. */
  async attach(owner_id: string, integration_id: string, agent_id: string): Promise<Integration> {
    const record = await this.require(owner_id, integration_id);
    await this.integrations.attach(owner_id, integration_id, agent_id);
    return to_integration_view(record);
  }

  async detach(owner_id: string, integration_id: string, agent_id: string): Promise<void> {
    await this.require(owner_id, integration_id);
    if (!(await this.integrations.detach(owner_id, integration_id, agent_id))) {
      throw new NotFoundException('The integration is not attached to the agent');
    }
  }

  /** The integrations attached to an agent, as rows, for its tools. */
  list_for_agent(owner_id: string, agent_id: string): Promise<IntegrationRecord[]> {
    return this.integrations.list_for_agent(owner_id, agent_id);
  }

  /** @throws NotFoundException when the integration is missing. */
  async require(owner_id: string, id: string): Promise<IntegrationRecord> {
    const record = await this.integrations.find(owner_id, id);
    if (record === null) throw new NotFoundException('Integration not found');
    return record;
  }

  /** The required placeholders the values leave out. */
  missing_required(record: IntegrationRecord, values: PlaceholderValues): string[] {
    return placeholders_of(record)
      .filter((placeholder) => placeholder.required && !(values[placeholder.name] ?? '').length)
      .map((placeholder) => placeholder.name);
  }

  /**
   * The request the values would make, with the token shown as `[redacted]` wherever it lands.
   * This is what the owner sees in the approval inbox.
   */
  preview(record: IntegrationRecord, values: PlaceholderValues): string {
    const request = this.render(record, values, '[redacted]');
    const headers = Object.entries(request.headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n');
    return [`${request.method} ${request.url}`, headers, request.body ?? '']
      .filter((part) => part.length > 0)
      .join('\n\n');
  }

  /** Sends the rendered request and returns the status and an excerpt. Never throws on HTTP errors. */
  async call(record: IntegrationRecord, values: PlaceholderValues): Promise<IntegrationCallResult> {
    const token =
      record.token_ciphertext === null ? '' : this.secret_box.open(record.token_ciphertext);
    const request = this.render(record, values, token);
    const started = Date.now();
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body !== null && { body: request.body }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.integrations.timeout_ms),
      });
      const text = await response.text();
      return {
        status: response.status,
        excerpt: text.slice(0, EXCERPT_CHARS),
        duration_ms: Date.now() - started,
      };
    } catch (error: unknown) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `no answer in ${this.config.integrations.timeout_ms} ms`
          : error instanceof Error
            ? error.message
            : 'unknown error';
      return {
        status: 0,
        excerpt: `The call failed: ${reason}`,
        duration_ms: Date.now() - started,
      };
    }
  }

  private render(
    record: IntegrationRecord,
    values: PlaceholderValues,
    token: string,
  ): RenderedRequest {
    const all = { ...values, [TOKEN_PLACEHOLDER]: token };
    const headers: Record<string, string> = {};
    for (const [name, template] of Object.entries(headers_of(record))) {
      headers[name] = render_template(template, all, 'header');
    }
    const content_type = body_content_type(record.body_format);
    if (content_type !== null && !('content-type' in lower_keys(headers))) {
      headers['content-type'] = content_type;
    }
    const body =
      record.body_format === 'none' || record.body_template === null
        ? null
        : render_template(record.body_template, all, body_escaping(record.body_format));
    return {
      method: record.method,
      url: render_template(record.url, all, 'url'),
      headers,
      body: record.method === 'GET' ? null : body,
    };
  }
}

function lower_keys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}
