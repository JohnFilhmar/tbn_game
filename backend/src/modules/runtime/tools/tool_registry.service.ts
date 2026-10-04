import { Injectable, Logger } from '@nestjs/common';
import type { PluginTool as PluginToolInfo, ToolPolicies, ToolPolicy } from '@tbn/contracts';
import { z } from 'zod';
import type { AgentRecord } from '@/modules/company/types/company_records';
import { IntegrationService } from '@/modules/integrations/services/integration.service';
import { PluginError, PluginService } from '@/modules/integrations/services/plugin.service';
import type { PluginRecord } from '@/modules/integrations/types/integration_records';
import { RunSourceService } from '@/modules/runtime/services/taint/run_source.service';
import type { ToolDefinition } from '@/modules/runtime/types/model_request';
import { DelegateTaskTool } from './delegate_task.tool';
import { IntegrationTool } from './dynamic/integration_tool';
import { PluginTool } from './dynamic/plugin_tool';
import { FetchUrlTool } from './fetch_url.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './file_tools';
import { DeclineTaskTool } from './decline_task.tool';
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

/** How long a plugin's tool list is reused before it is asked again. */
const PLUGIN_LIST_TTL_MS = 60_000;

/** The tools one agent has for one turn: the built-ins, its integrations and its plugins' tools. */
export interface AgentToolSet {
  get(name: string): Tool | undefined;
  /** Definitions of the tools an agent of `level` may see, in registration order. */
  definitions_for(policies: ToolPolicies, level: number): ToolDefinition[];
  /** What the agent should be told once per run, such as a plugin that did not answer. */
  notes: string[];
}

/**
 * The built-in tools, which agents may use them, and the policy of each for a given agent. The
 * registry is per agent: an agent also gets one tool per attached integration and one per tool
 * of each attached plugin, listed from the plugin and reused for a minute.
 */
@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly builtins: ReadonlyMap<string, Tool>;
  private readonly plugin_lists = new Map<string, { at: number; tools: PluginToolInfo[] | null }>();

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
    decline_task: DeclineTaskTool,
    run_command: RunCommandTool,
    git_checkout: GitCheckoutTool,
    git_publish: GitPublishTool,
    git_diff: GitDiffTool,
    git_log: GitLogTool,
    review_branch: ReviewBranchTool,
    merge_feature_branch: MergeFeatureBranchTool,
    open_merge_request: OpenMergeRequestTool,
    private readonly integrations: IntegrationService,
    private readonly plugins: PluginService,
    private readonly sources: RunSourceService,
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
      decline_task,
      run_command,
      git_checkout,
      git_publish,
      git_diff,
      git_log,
      review_branch,
      merge_feature_branch,
      open_merge_request,
    ];
    this.builtins = new Map(all.map((tool) => [tool.name, tool]));
  }

  /** True when an agent of `level` may use the tool at all. */
  available_to(tool: Tool, level: number): boolean {
    return tool.levels === undefined || tool.levels.some((allowed) => allowed === level);
  }

  /** The policy for one tool under an agent's `tool_policy`. */
  policy_of(tool: Tool, policies: ToolPolicies): ToolPolicy {
    return policies[tool.name] ?? tool.default_policy;
  }

  /** The tools of one agent right now. */
  async for_agent(agent: AgentRecord): Promise<AgentToolSet> {
    const tools = new Map(this.builtins);
    const notes: string[] = [];
    for (const integration of await this.integrations.list_for_agent(agent.owner_id, agent.id)) {
      const tool = new IntegrationTool(integration, this.integrations);
      tools.set(tool.name, tool);
    }
    for (const plugin of await this.plugins.list_for_agent(agent.owner_id, agent.id)) {
      const listed = await this.plugin_tools(plugin);
      if (listed === null) {
        notes.push(
          `The plugin ${plugin.name} did not answer, so its tools are not available for now.`,
        );
        continue;
      }
      for (const info of listed) {
        const tool = new PluginTool(plugin, info, this.plugins, this.sources);
        tools.set(tool.name, tool);
      }
    }
    return {
      get: (name) => tools.get(name),
      definitions_for: (policies, level) => this.definitions(tools, policies, level),
      notes,
    };
  }

  private definitions(
    tools: ReadonlyMap<string, Tool>,
    policies: ToolPolicies,
    level: number,
  ): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const tool of tools.values()) {
      if (!this.available_to(tool, level)) continue;
      if (this.policy_of(tool, policies) === 'deny') continue;
      definitions.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.json_schema ?? z.toJSONSchema(tool.input_schema, { target: 'draft-7' }),
      });
    }
    return definitions;
  }

  /** The plugin's tools, listed at most once a minute. Null when it did not answer. */
  private async plugin_tools(plugin: PluginRecord): Promise<PluginToolInfo[] | null> {
    const cached = this.plugin_lists.get(plugin.id);
    if (cached !== undefined && Date.now() - cached.at < PLUGIN_LIST_TTL_MS) return cached.tools;
    let tools: PluginToolInfo[] | null;
    try {
      tools = await this.plugins.list_tools(plugin);
    } catch (error: unknown) {
      if (!(error instanceof PluginError)) throw error;
      this.logger.warn(`Plugin ${plugin.name} offers no tools this minute: ${error.message}`);
      tools = null;
    }
    this.plugin_lists.set(plugin.id, { at: Date.now(), tools });
    return tools;
  }
}
