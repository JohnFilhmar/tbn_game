/** What a line in the message box asks for: a message, or one of the commands. */
export type ChatCommand =
  | { kind: 'message' }
  | { kind: 'task'; title: string; instructions: string }
  | { kind: 'help' }
  | { kind: 'unknown'; name: string };

/** The commands, as `/help` lists them. */
export const COMMAND_HELP =
  '/task <what to do> gives this agent a task. /help shows this list. Anything else is a message.';

/** The longest task title a command makes; the whole text stays the instructions. */
const MOST_TITLE_CHARS = 80;

/** A task title from its instructions: the first line, cut at a word to fit. */
function titleOf(instructions: string): string {
  const line = (instructions.split('\n')[0] ?? '').replace(/\s+/g, ' ').trim();
  if (line.length <= MOST_TITLE_CHARS) return line;
  const cut = line.slice(0, MOST_TITLE_CHARS - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > 40 ? cut.slice(0, space) : cut}…`;
}

/**
 * Reads a line from the message box. A line starting with `/` is a command and never reaches the
 * model; `/task` with nothing to do counts as asking for help.
 */
export function parseCommand(text: string): ChatCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { kind: 'message' };
  const match = /^\/(\S*)\s*([\s\S]*)$/.exec(trimmed);
  const name = (match?.[1] ?? '').toLowerCase();
  const rest = (match?.[2] ?? '').trim();
  if (name === 'help') return { kind: 'help' };
  if (name === 'task') {
    return rest === ''
      ? { kind: 'help' }
      : { kind: 'task', title: titleOf(rest), instructions: rest };
  }
  return { kind: 'unknown', name };
}
