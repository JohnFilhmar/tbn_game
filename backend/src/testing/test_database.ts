import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { require_database_url, type AppConfig } from '@/config/config.schema';
import { PrismaService } from '@/lib/database/prisma.service';

const exec_file = promisify(execFile);

/** A throwaway database on the test server, for tests of the release step itself. */
export interface TestDatabase {
  /** Connection URL of the new, empty database. */
  url: string;
  /** Drops the database, closing any connection still on it. */
  drop(): Promise<void>;
}

/**
 * Creates an empty database next to the test database. Callers run `migrate_test_database` on it
 * when they need the schema, and `drop` it when done.
 *
 * @param config - Test configuration; its `DATABASE_URL` names the server and the admin user.
 */
export async function create_test_database(config: AppConfig): Promise<TestDatabase> {
  const name = `tbn_test_${randomBytes(4).toString('hex')}`;
  const admin = new PrismaService(config);
  await admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);
  const url = new URL(require_database_url(config));
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      await admin.$executeRawUnsafe(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
}

/**
 * Runs the migration release step, `prisma migrate deploy`, against a database, the way the
 * deploy and the smoke test do.
 *
 * @param database_url - The database to migrate.
 */
export async function migrate_test_database(database_url: string): Promise<void> {
  await exec_file(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: database_url },
    },
  );
}
