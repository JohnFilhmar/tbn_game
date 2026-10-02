import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

/** A plugin name, which prefixes its tools in an agent's tool list. */
export const PluginNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9_]*$/, 'lowercase letters, digits and underscores');

/**
 * A Model Context Protocol server over streamable HTTP. The token is write-only and stays in the
 * worker; its tools appear in an attached agent's tool list as `plugin_<name>__<tool>`.
 */
export const PluginSchema = z.strictObject({
  id: IdSchema,
  name: PluginNameSchema,
  url: z.url({ protocol: /^https?$/ }),
  token_set: z.boolean(),
  enabled: z.boolean(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A plugin as the API returns it. */
export type Plugin = z.infer<typeof PluginSchema>;

/** Body of `POST /plugins`. */
export const CreatePluginSchema = PluginSchema.pick({ name: true, url: true, enabled: true })
  .partial({ enabled: true })
  .extend({ token: z.string().min(1).max(4_096).optional() });

/** Body of `POST /plugins`. */
export type CreatePlugin = z.infer<typeof CreatePluginSchema>;

/** Body of `PATCH /plugins/:id`. */
export const UpdatePluginSchema = CreatePluginSchema.partial();

/** Body of `PATCH /plugins/:id`. */
export type UpdatePlugin = z.infer<typeof UpdatePluginSchema>;

/** One tool a plugin offers, as `POST /plugins/:id/tools` lists them. */
export const PluginToolSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string(),
  input_schema: z.record(z.string(), z.json()),
});

/** A plugin tool. */
export type PluginTool = z.infer<typeof PluginToolSchema>;
