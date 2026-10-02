import { statfs } from 'node:fs/promises';

/**
 * How full the file system holding `path` is, the way `df` reports it: the blocks in use against
 * the blocks in use plus the ones still available to a user, so reserved blocks count for neither.
 */
export async function disk_used_percent(path: string): Promise<number> {
  const stats = await statfs(path);
  const used = stats.blocks - stats.bfree;
  const total = used + stats.bavail;
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
}
