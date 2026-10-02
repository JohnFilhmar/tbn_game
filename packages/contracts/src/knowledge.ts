import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';
import { RoleNameSchema } from './company';

/** Where an instruction applies: every agent, every agent with a role, or one agent. */
export const InstructionScopeSchema = z.enum(['global', 'role', 'agent']);

/** `global`, `role` or `agent`. */
export type InstructionScope = z.infer<typeof InstructionScopeSchema>;

/** A standing rule injected into system prompts. */
export const InstructionSchema = z.strictObject({
  id: IdSchema,
  scope: InstructionScopeSchema,
  role: RoleNameSchema.nullable(),
  agent_id: IdSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  position: z.number().int().min(0).max(10_000),
  enabled: z.boolean(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** An instruction as the API returns it. */
export type Instruction = z.infer<typeof InstructionSchema>;

const InstructionWriteSchema = InstructionSchema.pick({
  scope: true,
  role: true,
  agent_id: true,
  title: true,
  body: true,
  position: true,
  enabled: true,
});

/** Returns why a scope and its target do not match, or null when they do. */
export function instruction_target_problem(
  scope: InstructionScope,
  role: string | null | undefined,
  agent_id: string | null | undefined,
): string | null {
  const has_role = role !== null && role !== undefined;
  const has_agent = agent_id !== null && agent_id !== undefined;
  if (scope === 'global' && (has_role || has_agent))
    return 'a global instruction has no role or agent';
  if (scope === 'role' && (!has_role || has_agent))
    return 'a role instruction needs a role and no agent';
  if (scope === 'agent' && (!has_agent || has_role))
    return 'an agent instruction needs an agent and no role';
  return null;
}

/** Body of `POST /instructions`. */
export const CreateInstructionSchema = InstructionWriteSchema.partial({
  role: true,
  agent_id: true,
  position: true,
  enabled: true,
}).refine((value) => instruction_target_problem(value.scope, value.role, value.agent_id) === null, {
  message: 'scope does not match role and agent_id',
  path: ['scope'],
});

/** Body of `POST /instructions`. */
export type CreateInstruction = z.infer<typeof CreateInstructionSchema>;

/** Body of `PATCH /instructions/:id`. Scope and target are checked together after merging. */
export const UpdateInstructionSchema = InstructionWriteSchema.partial();

/** Body of `PATCH /instructions/:id`. */
export type UpdateInstruction = z.infer<typeof UpdateInstructionSchema>;

/** Query of `GET /instructions`. */
export const InstructionListQuerySchema = z.strictObject({
  scope: InstructionScopeSchema.optional(),
  agent_id: IdSchema.optional(),
});

/** Query of `GET /instructions`. */
export type InstructionListQuery = z.infer<typeof InstructionListQuerySchema>;

/** Where a skill is attached: every agent with a role, or one agent. */
export const SkillAttachmentSchema = z.discriminatedUnion('target_type', [
  z.strictObject({ target_type: z.literal('role'), role: RoleNameSchema }),
  z.strictObject({ target_type: z.literal('agent'), agent_id: IdSchema }),
]);

/** A skill attachment. */
export type SkillAttachment = z.infer<typeof SkillAttachmentSchema>;

/** A skill name, as in a `SKILL.md` frontmatter. */
export const SkillNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters, digits, underscores and dashes');

/** A skill: a name, a one-line description shown in prompts, and a body loaded on demand. */
export const SkillSchema = z.strictObject({
  id: IdSchema,
  name: SkillNameSchema,
  description: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((value) => !value.includes('\n'), 'one line'),
  body: z.string().trim().min(1).max(100_000),
  attachments: z.array(SkillAttachmentSchema).max(100),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

/** A skill as the API returns it. */
export type Skill = z.infer<typeof SkillSchema>;

/** Body of `POST /skills`. */
export const CreateSkillSchema = SkillSchema.pick({ name: true, description: true, body: true });

/** Body of `POST /skills`. */
export type CreateSkill = z.infer<typeof CreateSkillSchema>;

/** Body of `PATCH /skills/:id`. */
export const UpdateSkillSchema = CreateSkillSchema.partial();

/** Body of `PATCH /skills/:id`. */
export type UpdateSkill = z.infer<typeof UpdateSkillSchema>;

/** Body of `POST /skills/import`: a `SKILL.md` file with `name` and `description` frontmatter. */
export const ImportSkillSchema = z.strictObject({ markdown: z.string().min(1).max(200_000) });

/** Body of `POST /skills/import`. */
export type ImportSkill = z.infer<typeof ImportSkillSchema>;

/** Body of `PUT /skills/:id/attachments`. Replaces every attachment of the skill. */
export const ReplaceSkillAttachmentsSchema = SkillSchema.pick({ attachments: true });

/** Body of `PUT /skills/:id/attachments`. */
export type ReplaceSkillAttachments = z.infer<typeof ReplaceSkillAttachmentsSchema>;

function is_time_zone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Every preference with its type. `GET /preferences` returns all of them, defaults applied. */
export const PreferencesSchema = z.strictObject({
  report_style: z.enum(['concise', 'detailed']),
  time_zone: z.string().min(1).max(64).refine(is_time_zone, 'an IANA time zone'),
  theme: z.enum(['light', 'dark', 'system']),
  intern_idle_ttl_minutes: z.number().min(0.01).max(10_080),
  runaway_guard_turns: z.number().int().min(3).max(1_000),
  cap_threshold_longest_percent: z.number().int().min(1).max(100),
  cap_threshold_shorter_percent: z.number().int().min(1).max(100),
  max_interns_per_manager: z.number().int().min(1).max(1_000).nullable(),
  max_live_agents: z.number().int().min(1).max(10_000).nullable(),
  sandbox_timeout_seconds: z.number().int().min(1).max(86_400),
  sandbox_cpus: z.number().min(0.1).max(64),
  sandbox_memory_mb: z.number().int().min(64).max(262_144),
  sandbox_scratch_mb: z.number().int().min(16).max(65_536),
  search_cache_ttl_minutes: z.number().min(0).max(525_600),
  fetch_cache_ttl_minutes: z.number().min(0).max(525_600),
  fetch_max_chars: z.number().int().min(1_000).max(2_000_000),
  disk_alert_percent: z.number().int().min(1).max(100),
});

/** The owner's preferences. */
export type Preferences = z.infer<typeof PreferencesSchema>;

/** A preference key. */
export const PreferenceKeySchema = PreferencesSchema.keyof();

/** A preference key. */
export type PreferenceKey = z.infer<typeof PreferenceKeySchema>;

/** Values used until the owner sets a preference. */
export const PREFERENCE_DEFAULTS: Preferences = {
  report_style: 'concise',
  time_zone: 'UTC',
  theme: 'system',
  intern_idle_ttl_minutes: 30,
  runaway_guard_turns: 50,
  cap_threshold_longest_percent: 75,
  cap_threshold_shorter_percent: 85,
  max_interns_per_manager: null,
  max_live_agents: null,
  sandbox_timeout_seconds: 600,
  sandbox_cpus: 1,
  sandbox_memory_mb: 1024,
  sandbox_scratch_mb: 512,
  search_cache_ttl_minutes: 1440,
  fetch_cache_ttl_minutes: 1440,
  fetch_max_chars: 40_000,
  disk_alert_percent: 90,
};

/** Body of `PUT /preferences/:key`. The value is checked against the key's own schema. */
export const SetPreferenceSchema = z.strictObject({ value: z.json() });

/** Body of `PUT /preferences/:key`. */
export type SetPreference = z.infer<typeof SetPreferenceSchema>;
