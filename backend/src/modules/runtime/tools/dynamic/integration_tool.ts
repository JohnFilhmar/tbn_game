import { z, type ZodType } from 'zod';
import {
  placeholders_of,
  type IntegrationService,
} from '@/modules/integrations/services/integration.service';
import type { IntegrationRecord } from '@/modules/integrations/types/integration_records';
import { slugify } from '@/modules/runtime/services/git/branch_rules';
import type { Tool, ToolOutcome } from '../tool.interface';

/** The input of an integration tool: one string per declared placeholder. */
type Values = Record<string, string | undefined>;

/** The tool name of an integration: `call_` and its name as a slug with underscores. */
export function integration_tool_name(integration: IntegrationRecord): string {
  return `call_${slugify(integration.name).replace(/-/g, '_')}`;
}

/**
 * An integration as an agent's tool: `call_<integration>`, whose input is the declared
 * placeholders. It leaves the server, so it defaults to `ask` and always waits for the owner in
 * a tainted run. The agent sees the status and an excerpt, never a header or the token.
 */
export class IntegrationTool implements Tool<Values> {
  readonly name: string;
  readonly description: string;
  readonly default_policy = 'ask';
  readonly outward = true;
  readonly input_schema: ZodType<Values>;

  constructor(
    private readonly integration: IntegrationRecord,
    private readonly integrations: IntegrationService,
  ) {
    this.name = integration_tool_name(integration);
    const placeholders = placeholders_of(integration);
    this.description = `Call the ${integration.name} integration (${integration.method} ${integration.url}). It sends a request outside the company; the owner approves each call.`;
    const shape: Record<string, ZodType<string | undefined>> = {};
    for (const placeholder of placeholders) {
      const field = z.string().max(20_000).describe(placeholder.description);
      shape[placeholder.name] = placeholder.required ? field : field.optional();
    }
    this.input_schema = z.strictObject(shape);
  }

  async execute(input: Values): Promise<ToolOutcome> {
    const result = await this.integrations.call(this.integration, strings_of(input));
    return {
      content: `HTTP ${result.status} in ${result.duration_ms} ms\n${result.excerpt}`,
      is_error: result.status === 0 || result.status >= 400,
    };
  }

  preview(input: Values): Promise<string | null> {
    return Promise.resolve(this.integrations.preview(this.integration, strings_of(input)));
  }
}

function strings_of(input: Values): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
  );
}
