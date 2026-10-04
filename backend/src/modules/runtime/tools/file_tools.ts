import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WorkspacePathError, resolve_workspace_path } from '@/lib/workspace/resolve_workspace_path';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

const MAX_READ_BYTES = 5_000_000;
/** The most characters one read returns; an offset reads on from there. */
const MOST_READ_CHARS = 40_000;
const MAX_WRITE_BYTES = 1_000_000;

/** What read_file takes: a path, and optionally where to start and how much to read. */
interface ReadFileInput {
  path: string;
  offset?: number;
  length?: number;
}
const MAX_LIST_ENTRIES = 200;

const PathSchema = z
  .string()
  .min(1)
  .max(1_000)
  .describe('Path relative to the workspace root, for example notes/draft.md');

function error_outcome(error: unknown): ToolOutcome {
  if (error instanceof WorkspacePathError) return { content: error.message, is_error: true };
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'ENOENT') return { content: 'No such file or directory', is_error: true };
  if (code === 'EISDIR') return { content: 'Path is a directory', is_error: true };
  if (code === 'ENOTDIR') return { content: 'Path is not a directory', is_error: true };
  throw error;
}

/** Lists files and directories under a workspace path. */
@Injectable()
export class ListFilesTool implements Tool<{ path?: string }> {
  readonly name = 'list_files';
  readonly description =
    'List the files and directories at a path in the company workspace. Directories end with a slash.';
  readonly default_policy = 'auto';
  readonly input_schema = z.strictObject({ path: PathSchema.optional() });

  async execute(input: { path?: string }, context: ToolContext): Promise<ToolOutcome> {
    try {
      const target = await resolve_workspace_path(context.workspace_dir, input.path ?? '.');
      const entries = await readdir(target, { withFileTypes: true });
      const lines = entries
        .slice(0, MAX_LIST_ENTRIES)
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort();
      if (entries.length > MAX_LIST_ENTRIES)
        lines.push(`... ${entries.length - MAX_LIST_ENTRIES} more`);
      return { content: lines.length > 0 ? lines.join('\n') : '(empty)' };
    } catch (error: unknown) {
      return error_outcome(error);
    }
  }
}

/**
 * The part of a file's text from `offset`, at most `length` characters, with a note of how much
 * is left and where reading on starts.
 */
export function text_window(text: string, offset: number, length: number): string {
  const end = Math.min(text.length, offset + length);
  const part = text.slice(offset, end);
  const rest = text.length - end;
  return rest > 0
    ? `${part}\n... ${rest} more characters; read_file with offset ${end} reads on`
    : part;
}

/** Reads a text file from the workspace. */
@Injectable()
export class ReadFileTool implements Tool<ReadFileInput> {
  readonly name = 'read_file';
  readonly description = `Read a text file from the company workspace, at most ${MOST_READ_CHARS} characters at a time; pass offset and length for a part of a longer file.`;
  readonly default_policy = 'auto';
  readonly input_schema = z.strictObject({
    path: PathSchema,
    offset: z.int().min(0).optional(),
    length: z.int().min(1).max(MOST_READ_CHARS).optional(),
  });

  async execute(input: ReadFileInput, context: ToolContext): Promise<ToolOutcome> {
    try {
      const target = await resolve_workspace_path(context.workspace_dir, input.path);
      const info = await stat(target);
      if (info.isDirectory()) return { content: 'Path is a directory', is_error: true };
      const buffer = await readFile(target);
      const text = buffer.subarray(0, MAX_READ_BYTES).toString('utf8');
      return { content: text_window(text, input.offset ?? 0, input.length ?? MOST_READ_CHARS) };
    } catch (error: unknown) {
      return error_outcome(error);
    }
  }
}

/** Writes a text file into the workspace, creating directories on the way. */
@Injectable()
export class WriteFileTool implements Tool<{ path: string; content: string }> {
  readonly name = 'write_file';
  readonly description =
    'Write a text file into the company workspace, replacing it if it exists. Parent directories are created.';
  readonly default_policy = 'auto';
  readonly input_schema = z.strictObject({
    path: PathSchema,
    content: z.string().max(MAX_WRITE_BYTES).describe('The whole file content'),
  });

  async execute(
    input: { path: string; content: string },
    context: ToolContext,
  ): Promise<ToolOutcome> {
    try {
      const target = await resolve_workspace_path(context.workspace_dir, input.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, input.content, 'utf8');
      const written = relative(context.workspace_dir, target);
      return { content: `Wrote ${Buffer.byteLength(input.content, 'utf8')} bytes to ${written}` };
    } catch (error: unknown) {
      return error_outcome(error);
    }
  }
}
