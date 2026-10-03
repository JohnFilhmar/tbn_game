import type { Agent, ToolPolicy } from '@tbn/contracts';
import { PaletteSlotSchema, type PaletteSlot } from '@/game/assets/characterManifest';
import { CHARACTER_SET } from '@/game/assets/characters';
import { optionalText } from '@/lib/forms/text';

/** One row of the tool policy editor. */
export interface ToolPolicyRow {
  tool: string;
  policy: ToolPolicy;
}

/** The recruit and profile form's fields, as the owner types them. */
export interface AgentDraft {
  name: string;
  role: string;
  job_description: string;
  provider_id: string;
  primary_model: string;
  intern_model: string;
  body: string;
  hair: string;
  outfit: string;
  accessory: string;
  /** Every palette slot, the set's default where the agent chose nothing. */
  colors: Record<PaletteSlot, string>;
  tool_policy: ToolPolicyRow[];
}

/** The palette with an agent's own colours over it. */
export function paletteOf(colors: Record<string, string> | undefined): Record<PaletteSlot, string> {
  const palette: Record<PaletteSlot, string> = { ...CHARACTER_SET.manifest.palette };
  for (const slot of PaletteSlotSchema.options) {
    const own = colors?.[slot];
    if (own !== undefined) palette[slot] = own;
  }
  return palette;
}

/** An empty recruit form. */
export const EMPTY_AGENT_DRAFT: AgentDraft = {
  name: '',
  role: '',
  job_description: '',
  provider_id: '',
  primary_model: '',
  intern_model: '',
  body: '',
  hair: '',
  outfit: '',
  accessory: '',
  colors: paletteOf(undefined),
  tool_policy: [],
};

/** The profile form of an existing agent. */
export function agentDraftOf(agent: Agent): AgentDraft {
  return {
    name: agent.name,
    role: agent.role,
    job_description: agent.job_description,
    provider_id: agent.provider_id,
    primary_model: agent.primary_model,
    intern_model: agent.intern_model,
    body: agent.appearance.body ?? '',
    hair: agent.appearance.hair ?? '',
    outfit: agent.appearance.outfit ?? '',
    accessory: agent.appearance.accessory ?? '',
    colors: paletteOf(agent.appearance.colors),
    tool_policy: Object.entries(agent.tool_policy).map(([tool, policy]) => ({ tool, policy })),
  };
}

/**
 * The request body of the form. Only a colour that differs from the set's palette is sent, so an
 * agent whose look was never touched keeps the one the world derives from its id.
 */
export function agentInput(draft: AgentDraft): unknown {
  const palette = new Map<string, string>(Object.entries(CHARACTER_SET.manifest.palette));
  const colors = Object.fromEntries(
    Object.entries(draft.colors).filter(([slot, color]) => palette.get(slot) !== color),
  );
  return {
    name: draft.name.trim(),
    role: draft.role.trim(),
    job_description: draft.job_description.trim(),
    provider_id: draft.provider_id,
    primary_model: draft.primary_model,
    intern_model: draft.intern_model,
    appearance: {
      body: optionalText(draft.body),
      hair: optionalText(draft.hair),
      outfit: optionalText(draft.outfit),
      accessory: optionalText(draft.accessory),
      colors: Object.keys(colors).length > 0 ? colors : undefined,
    },
    tool_policy: Object.fromEntries(
      draft.tool_policy
        .filter((row) => row.tool.trim().length > 0)
        .map((row) => [row.tool.trim(), row.policy]),
    ),
  };
}
