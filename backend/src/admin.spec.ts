import type { NestExpressApplication } from '@nestjs/platform-express';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import { IntegrationService } from '@/modules/integrations/services/integration.service';
import { NotificationService } from '@/modules/integrations/services/notification.service';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_owner } from '@/testing/test_owner';
import { run_admin_command } from '@/testing/test_worker';

const NoticeOutputSchema = z.object({ notified_owners: z.number().int() });

describe('admin.js backup_failed', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
  });

  afterAll(async () => {
    await app.close();
  });

  it("queues a backup_failed notice on the owner's channel and records no process boot", async () => {
    const owner = await create_test_owner(app);
    const integration = await app.get(IntegrationService).create(owner.owner_id, {
      name: 'Pager',
      method: 'POST',
      url: 'http://127.0.0.1:9/hook',
      headers: {},
      body_format: 'json',
      body_template: '{"text": "{{body}}"}',
      placeholders: [{ name: 'body', description: 'The body', required: true }],
    });
    await app.get(NotificationService).create_channel(owner.owner_id, {
      event_type: 'backup_failed',
      integration_id: integration.id,
    });
    const prisma = app.get(PrismaService);
    const boots_before = await prisma.processInstance.count();

    const result = await run_admin_command(['backup_failed', 'pg_dump', 'exited', 'with', '1']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(NoticeOutputSchema.parse(JSON.parse(result.stdout)).notified_owners).toBeGreaterThan(0);

    const rows = await app
      .get(NotificationService)
      .list(owner.owner_id, { event_type: 'backup_failed' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'The backup failed',
      priority: 'high',
      status: 'pending',
    });
    expect(rows[0]?.channel_id).not.toBeNull();
    expect(rows[0]?.message).toContain('pg_dump exited with 1');
    expect(await prisma.processInstance.count()).toBe(boots_before);
  });

  it('refuses a notice without a reason', async () => {
    const result = await run_admin_command(['backup_failed']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('reason: required');
  });
});
