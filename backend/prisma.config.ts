import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration, read by `prisma generate` and `prisma migrate`. This is CLI tooling, not
 * application code, so it reads `DATABASE_URL` itself. `generate` works without it.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
