import type { INestApplicationContext } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';

const CountSchema = z.array(z.object({ count: z.bigint() }));

/**
 * How many `agent_wake` jobs exist for an agent. A wake due now is not sent while another due one
 * is queued for the same agent, so a test clears the agent's wakes before the step it checks.
 */
export async function count_wakes(app: INestApplicationContext, agent_id: string): Promise<number> {
  const rows: unknown = await app.get(PrismaService).$queryRaw`
    SELECT count(*)::bigint AS count FROM pgboss.job
    WHERE name = 'agent_wake' AND data->>'agent_id' = ${agent_id}`;
  return Number(CountSchema.parse(rows)[0]?.count ?? 0);
}

/** Deletes every `agent_wake` job of an agent. */
export async function clear_wakes(app: INestApplicationContext, agent_id: string): Promise<void> {
  await app.get(PrismaService).$executeRaw`
    DELETE FROM pgboss.job WHERE name = 'agent_wake' AND data->>'agent_id' = ${agent_id}`;
}
