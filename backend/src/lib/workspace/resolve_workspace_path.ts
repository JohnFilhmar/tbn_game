import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

/** Raised when a requested path would leave the workspace. */
export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePathError';
  }
}

function is_within(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

/** The real path of the deepest ancestor that exists, so symlinks on the way are followed. */
async function real_existing_ancestor(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      return await realpath(current);
    } catch {
      const parent = dirname(current);
      if (parent === current) throw new WorkspacePathError('Workspace root does not exist');
      current = parent;
    }
  }
}

/**
 * Resolves a path an agent asked for inside the workspace root. Absolute paths, `..` escapes and
 * symlinks that point outside the root are refused, so a shell-less tool cannot read or write
 * beyond the workspace.
 *
 * @param root - The workspace root, an absolute path.
 * @param requested - The path as the agent wrote it, relative to the root.
 * @returns The absolute path to use.
 * @throws WorkspacePathError when the path leaves the root.
 */
export async function resolve_workspace_path(root: string, requested: string): Promise<string> {
  if (requested.includes('\0')) throw new WorkspacePathError('Path contains a null byte');
  if (isAbsolute(requested)) throw new WorkspacePathError('Path must be relative to the workspace');
  const absolute_root = resolve(root);
  const candidate = resolve(absolute_root, requested);
  if (!is_within(absolute_root, candidate)) {
    throw new WorkspacePathError('Path leaves the workspace');
  }
  const real_root = await realpath(absolute_root);
  const real_candidate = await real_existing_ancestor(candidate);
  if (!is_within(real_root, real_candidate)) {
    throw new WorkspacePathError('Path leaves the workspace through a link');
  }
  return candidate;
}
