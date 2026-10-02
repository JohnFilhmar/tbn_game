import { Injectable } from '@nestjs/common';
import type { ToolPolicies, ToolPolicy } from '@tbn/contracts';
import { z } from 'zod';
import type { ToolDefinition } from '@/modules/runtime/types/model_request';
import { DelegateTaskTool } from './delegate_task.tool';
import { FetchUrlTool } from './fetch_url.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './file_tools';
import { FinishTaskTool } from './finish_task.tool';
import { GitCheckoutTool } from './git/git_checkout.tool';
import { GitPublishTool } from './git/git_publish.tool';
import { GitDiffTool, GitLogTool } from './git/git_read.tools';
import { MergeFeatureBranchTool } from './git/merge_feature_branch.tool';
import { OpenMergeRequestTool } from './git/open_merge_request.tool';
import { ReviewBranchTool } from './git/review_branch.tool';
import { ListRosterTool } from './list_roster.tool';
import { LoadSkillTool } from './load_skill.tool';
import { RunCommandTool } from './run_command.tool';
import { SearchLibraryTool } from './search_library.tool';
import { SendMessageTool } from './send_message.tool';
import type { Tool } from './tool.interface';
import { WebSearchTool } from './web_search.tool';

/** The built-in tools, which agents may use them, and the policy of each for a given agent. */
@Injectable()
export class ToolRegistryService {
  private readonly tools: ReadonlyMap<string, Tool>;

  constructor(
    list_files: ListFilesTool,
    read_file: ReadFileTool,
    write_file: WriteFileTool,
    load_skill: LoadSkillTool,
    search_library: SearchLibraryTool,
    web_search: WebSearchTool,
    fetch_url: FetchUrlTool,
    list_roster: ListRosterTool,
    send_message: SendMessageTool,
    delegate_task: DelegateTaskTool,
    finish_task: FinishTaskTool,
    run_command: RunCommandTool,
    git_checkout: GitCheckoutTool,
    git_publish: GitPublishTool,
    git_diff: GitDiffTool,
    git_log: GitLogTool,
    review_branch: ReviewBranchTool,
    merge_feature_branch: MergeFeatureBranchTool,
    open_merge_request: OpenMergeRequestTool,
  ) {
    const all: Tool[] = [
      list_files,
      read_file,
      write_file,
      load_skill,
      search_library,
      web_search,
      fetch_url,
      list_roster,
      send_message,
      delegate_task,
      finish_task,
      run_command,
      git_checkout,
      git_publish,
      git_diff,
      git_log,
      review_branch,
      merge_feature_branch,
      open_merge_request,
    ];
    this.tools = new Map(all.map((tool) => [tool.name, tool]));
  }

  /** The tool by name, or undefined. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** True when an agent of `level` may use the tool at all. */
  available_to(tool: Tool, level: number): boolean {
    return tool.levels === undefined || tool.levels.some((allowed) => allowed === level);
  }

  /** The policy for one tool under an agent's `tool_policy`. */
  policy_of(tool: Tool, policies: ToolPolicies): ToolPolicy {
    return policies[tool.name] ?? tool.default_policy;
  }

  /**
   * Definitions of the tools an agent of `level` may see: everything available to its level and
   * not denied, in registration order.
   */
  definitions_for(policies: ToolPolicies, level: number): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (!this.available_to(tool, level)) continue;
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
