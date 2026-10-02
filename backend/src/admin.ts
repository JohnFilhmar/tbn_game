import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { OwnerSchema, PasswordSchema } from '@tbn/contracts';
import { AdminModule } from '@/admin.module';
import { load_config } from '@/config/load_config';
import { report_fatal } from '@/lib/process/report_fatal';
import { OwnerService } from '@/modules/identity/services/owner.service';
import { NotificationService } from '@/modules/integrations/services/notification.service';
import { SearchProviderService } from '@/modules/runtime/services/search/search_provider.service';

const USAGE = [
  'usage: admin.js owner_create <username>   (reads the password from stdin)',
  '       admin.js backup_failed <reason>    (tells every owner listening for backup_failed)',
].join('\n');

const REASON_MAX = 1_000;

function read_stdin(): string {
  return readFileSync(0, 'utf8').replace(/\r?\n$/, '');
}

/** Creates the owner account. This system has a single owner, so a second one is refused. */
async function owner_create(username_arg: string | undefined): Promise<void> {
  const username = OwnerSchema.shape.username.safeParse(username_arg);
  if (!username.success)
    throw new Error(`username: ${username.error.issues[0]?.message ?? 'invalid'}`);
  const password = PasswordSchema.safeParse(read_stdin());
  if (!password.success)
    throw new Error(`password: ${password.error.issues[0]?.message ?? 'invalid'}`);
  const config = load_config();
  const app = await NestFactory.createApplicationContext(AdminModule.register(config), {
    logger: false,
  });
  try {
    const owners = app.get(OwnerService);
    if ((await owners.count()) > 0) {
      throw new Error('An owner already exists. This system has a single owner account.');
    }
    const owner = await owners.create(username.data, password.data);
    const searxng_url = config.search.searxng_url;
    const search_provider =
      searxng_url === undefined
        ? null
        : await app.get(SearchProviderService).seed_searxng(owner.id, searxng_url);
    const line = JSON.stringify({
      owner_id: owner.id,
      username: owner.username,
      search_provider: search_provider?.name ?? null,
    });
    process.stdout.write(`${line}\n`);
  } finally {
    await app.close();
  }
}

/**
 * Tells every owner with a `backup_failed` channel that the backup failed. The backup script runs
 * it, so its alert goes through the notification channels like every other one; the worker
 * delivers it.
 */
async function backup_failed(reason_words: string[]): Promise<void> {
  const reason = reason_words.join(' ').trim().slice(0, REASON_MAX);
  if (reason.length === 0) throw new Error(`reason: required\n${USAGE}`);
  const config = load_config();
  const app = await NestFactory.createApplicationContext(AdminModule.register(config), {
    logger: false,
  });
  try {
    const notifications = app.get(NotificationService);
    const owners = await notifications.owners_listening('backup_failed');
    await notifications.emit_to_listeners({
      event_type: 'backup_failed',
      title: 'The backup failed',
      message: reason,
      priority: 'high',
      values: { error: reason },
    });
    process.stdout.write(`${JSON.stringify({ notified_owners: owners.length })}\n`);
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'owner_create':
      await owner_create(args[0]);
      return;
    case 'backup_failed':
      await backup_failed(args);
      return;
    default:
      throw new Error(USAGE);
  }
}

main().catch((error: unknown) => report_fatal('web', error));
