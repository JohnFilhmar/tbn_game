/**
 * The runtime's built-in tools, offered as suggestions in the tool policy editor. Integrations
 * add `call_<name>` and plugins `plugin_<name>__<tool>`; any tool name can be typed.
 */
export const BUILT_IN_TOOLS: readonly string[] = [
  'delegate_task',
  'fetch_url',
  'finish_task',
  'git_checkout',
  'git_diff',
  'git_log',
  'git_publish',
  'list_files',
  'list_roster',
  'load_skill',
  'merge_feature_branch',
  'open_merge_request',
  'read_file',
  'review_branch',
  'run_command',
  'search_library',
  'send_message',
  'web_search',
  'write_file',
];
