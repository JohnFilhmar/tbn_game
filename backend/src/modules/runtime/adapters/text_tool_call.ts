import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ToolUseBlockSchema } from '@tbn/contracts';
import type { ModelResponse } from '@/modules/runtime/types/model_request';

const TextToolCallSchema = z.looseObject({
  name: z.string(),
  parameters: z.unknown().optional(),
  arguments: z.unknown().optional(),
});

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

/**
 * Small local models, served through an OpenAI-compatible API, sometimes write a tool call as
 * the whole of their text, `{"name": "finish_task", "parameters": {...}}`, instead of a real call.
 * When the text is only that and names a tool the request offered, it becomes the tool call;
 * anything else is left as text.
 */
export function recover_text_tool_call(
  response: ModelResponse,
  tool_names: readonly string[],
): ModelResponse {
  const [block, ...rest] = response.content;
  if (block?.type !== 'text' || rest.length > 0) return response;
  const trimmed = block.text.trim();
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed;
  if (!body.startsWith('{')) return response;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return response;
  }
  const call = TextToolCallSchema.safeParse(raw);
  if (!call.success || !tool_names.includes(call.data.name)) return response;
  const input = ToolUseBlockSchema.shape.input.safeParse(
    call.data.parameters ?? call.data.arguments ?? {},
  );
  if (!input.success) return response;
  return {
    ...response,
    content: [{ type: 'tool_use', id: randomUUID(), name: call.data.name, input: input.data }],
    stop_reason: 'tool_use',
  };
}
