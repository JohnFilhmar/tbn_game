import { Injectable } from '@nestjs/common';
import type { ToolPolicies, ToolPolicy } from '@tbn/contracts';
import { z } from 'zod';
import type { ToolDefinition } from '@/modules/runtime/types/model_request';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './file_tools';
import { FinishTaskTool } from './finish_task.tool';
import { LoadSkillTool } from './load_skill.tool';
import type { Tool } from './tool.interface';

/** The built-in tools and the policy that applies to each for a given agent. */
@Injectable()
export class ToolRegistryService {
  private readonly tools: ReadonlyMap<string, Tool>;

  constructor(
    list_files: ListFilesTool,
    read_file: ReadFileTool,
    write_file: WriteFileTool,
    load_skill: LoadSkillTool,
    finish_task: FinishTaskTool,
  ) {
    const all: Tool[] = [list_files, read_file, write_file, load_skill, finish_task];
    this.tools = new Map(all.map((tool) => [tool.name, tool]));
  }

  /** The tool by name, or undefined. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** The policy for one tool under an agent's `tool_policy`. */
  policy_of(tool: Tool, policies: ToolPolicies): ToolPolicy {
    return policies[tool.name] ?? tool.default_policy;
  }

  /** Definitions of the tools the agent may see: everything not denied, in registration order. */
  definitions_for(policies: ToolPolicies): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (this.policy_of(tool, policies) === 'deny') continue;
      definitions.push({
        name: tool.name,
        description: tool.description,
        input_schema: z.toJSONSchema(tool.input_schema, { target: 'draft-7' }),
      });
    }
    return definitions;
  }
}
