import type { Agent, ToolPolicy } from '@tbn/contracts';
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
  tool_policy: ToolPolicyRow[];
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
    tool_policy: Object.entries(agent.tool_policy).map(([tool, policy]) => ({ tool, policy })),
  };
}

/** The request body of the form, keeping the agent's palette, which the form does not edit. */
export function agentInput(draft: AgentDraft, colors?: Record<string, string>): unknown {
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
      colors,
    },
    tool_policy: Object.fromEntries(
      draft.tool_policy
        .filter((row) => row.tool.trim().length > 0)
        .map((row) => [row.tool.trim(), row.policy]),
    ),
  };
}
