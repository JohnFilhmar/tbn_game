import { disk_used_percent } from './disk_usage';

describe('disk_used_percent', () => {
  it('reports a percentage for a real path and fails for a missing one', async () => {
    const percent = await disk_used_percent('.');
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
    await expect(disk_used_percent('/no/such/path')).rejects.toThrow();
  });
});
