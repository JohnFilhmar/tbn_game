import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspacePathError, resolve_workspace_path } from './resolve_workspace_path';

describe('resolve_workspace_path', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    const base = await mkdtemp(join(tmpdir(), 'tbn-workspace-'));
    root = join(base, 'workspace');
    outside = join(base, 'outside');
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(outside, join(root, 'escape'));
  });

  it('resolves relative paths inside the root, existing or not', async () => {
    await expect(resolve_workspace_path(root, 'docs/notes.md')).resolves.toBe(
      join(root, 'docs/notes.md'),
    );
    await expect(resolve_workspace_path(root, './new/dir/file.txt')).resolves.toBe(
      join(root, 'new/dir/file.txt'),
    );
    await expect(resolve_workspace_path(root, '.')).resolves.toBe(root);
  });

  it('refuses absolute paths and dot-dot escapes', async () => {
    await expect(resolve_workspace_path(root, '/etc/passwd')).rejects.toBeInstanceOf(
      WorkspacePathError,
    );
    await expect(resolve_workspace_path(root, '../outside/secret.txt')).rejects.toBeInstanceOf(
      WorkspacePathError,
    );
    await expect(resolve_workspace_path(root, 'docs/../../outside')).rejects.toBeInstanceOf(
      WorkspacePathError,
    );
    await expect(resolve_workspace_path(root, 'a\0b')).rejects.toBeInstanceOf(WorkspacePathError);
  });

  it('refuses a symlink that points outside the root', async () => {
    await expect(resolve_workspace_path(root, 'escape/secret.txt')).rejects.toThrow(/link/);
    await expect(resolve_workspace_path(root, 'escape/new.txt')).rejects.toThrow(/link/);
  });
});
