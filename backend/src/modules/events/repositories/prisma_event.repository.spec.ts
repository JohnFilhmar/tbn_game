import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEntitySchema } from '@tbn/contracts';
import { Client } from 'pg';
import { z } from 'zod';
import { require_database_url } from '@/config/config.schema';
import { PrismaService } from '@/lib/database/prisma.service';
import { InstructionService } from '@/modules/knowledge/services/instruction.service';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner } from '@/testing/test_owner';
import { wait_for } from '@/testing/wait_for';
import { EVENT_REPOSITORY, type EventRepository } from './interface/event_repository.interface';

/** Every table with the event trigger, and the entity and id column it records under. */
const EVENTED_TABLES: Record<string, [entity: string, id_column: string]> = {
  agents: ['agent', 'id'],
  departments: ['department', 'id'],
  tasks: ['task', 'id'],
  reports: ['report', 'id'],
  runs: ['run', 'id'],
  run_sources: ['run_source', 'id'],
  transcript_entries: ['transcript_entry', 'id'],
  approvals: ['approval', 'id'],
  sandbox_jobs: ['sandbox_job', 'id'],
  repositories: ['repository', 'id'],
  merge_requests: ['merge_request', 'id'],
  branch_reviews: ['branch_review', 'id'],
  providers: ['provider', 'id'],
  provider_models: ['provider', 'provider_id'],
  cap_windows: ['cap_windows', 'provider_id'],
  usage_records: ['cap_windows', 'provider_id'],
  search_providers: ['search_provider', 'id'],
  integrations: ['integration', 'id'],
  integration_attachments: ['agent_attachments', 'agent_id'],
  plugins: ['plugin', 'id'],
  plugin_attachments: ['agent_attachments', 'agent_id'],
  notification_channels: ['notification_channel', 'id'],
  notifications: ['notification', 'id'],
  instructions: ['instruction', 'id'],
  skills: ['skill', 'id'],
  skill_attachments: ['skill', 'skill_id'],
  preferences: ['preferences', 'owner_id'],
  world_layouts: ['world_layout', 'id'],
};

const TriggerRowsSchema = z.array(z.object({ table_name: z.string(), definition: z.string() }));
const TRIGGER_ARGUMENTS = /tbn_record_event\('([a-z_]+)', '([a-z_]+)', '([a-z_,]*)'\)/;

describe('the event log', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let events: EventRepository;
  let instructions: InstructionService;

  const instruction = { scope: 'global' as const, title: 'Rule', body: 'Be brief.' };

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    prisma = app.get(PrismaService);
    events = app.get<EventRepository>(EVENT_REPOSITORY);
    instructions = app.get(InstructionService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records every table the client reads at commit, under the entity of its view', async () => {
    const rows = TriggerRowsSchema.parse(
      await prisma.$queryRaw`
        SELECT c.relname AS table_name, pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = 'tbn_events'`,
    );
    const found: Record<string, [string, string]> = {};
    for (const row of rows) {
      expect(row.definition).toContain('AFTER INSERT OR DELETE OR UPDATE');
      expect(row.definition).toContain('DEFERRABLE INITIALLY DEFERRED FOR EACH ROW');
      const match = TRIGGER_ARGUMENTS.exec(row.definition);
      if (match?.[1] === undefined || match[2] === undefined) {
        throw new Error(`Unexpected trigger: ${row.definition}`);
      }
      found[row.table_name] = [match[1], match[2]];
    }
    expect(found).toEqual(EVENTED_TABLES);
    const entities = new Set(Object.values(EVENTED_TABLES).map(([entity]) => entity));
    expect([...entities].sort()).toEqual([...EventEntitySchema.options].sort());
  });

  it('writes an insert, the changed columns of an update and a delete, in order', async () => {
    const owner = await create_test_owner(app);
    const created = await instructions.create(owner.owner_id, instruction);
    await instructions.update(owner.owner_id, created.id, { title: 'Rule one' });
    await instructions.delete(owner.owner_id, created.id);

    expect(await events.list_after(owner.owner_id, 0, 100)).toMatchObject([
      { seq: 1, entity: 'instruction', entity_id: created.id, op: 'insert', changed: null },
      { seq: 2, entity: 'instruction', entity_id: created.id, op: 'update', changed: ['title'] },
      { seq: 3, entity: 'instruction', entity_id: created.id, op: 'delete', changed: null },
    ]);
    expect(await events.list_after(owner.owner_id, 1, 1)).toMatchObject([{ seq: 2 }]);
    expect(await events.bounds(owner.owner_id)).toEqual({ head_seq: 3, oldest_seq: 1 });
  });

  it('writes nothing for an update of ignored columns only, such as a lease heartbeat', async () => {
    const owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const runs = app.get<RunRepository>(RUN_REPOSITORY);
    const run = await runs.create(owner.owner_id, agent.id, null);
    const { head_seq } = await events.bounds(owner.owner_id);

    await runs.acquire_lease(owner.owner_id, run.id, 'worker_a', new Date(Date.now() + 30_000));
    await runs.extend_lease(owner.owner_id, run.id, 'worker_a', new Date(Date.now() + 60_000));
    await prisma.agent.update({ where: { id: agent.id }, data: { idle_since: new Date() } });
    expect((await events.bounds(owner.owner_id)).head_seq).toBe(head_seq);

    await runs.increment_turn(owner.owner_id, run.id);
    expect(await events.list_after(owner.owner_id, head_seq, 10)).toMatchObject([
      { entity: 'run', entity_id: run.id, op: 'update', changed: ['turn_count'] },
    ]);
  });

  it('records a change to a part as an update of the entity it belongs to', async () => {
    const owner = await create_test_owner(app);
    const provider = await create_test_provider(app, owner.owner_id, 'openai_chat_completions');
    await app.get(PreferenceService).set(owner.owner_id, 'theme', 'dark');

    const recorded = await events.list_after(owner.owner_id, 0, 100);
    const summary = recorded.map((event) => [event.entity, event.entity_id, event.op]);
    expect(summary).toContainEqual(['provider', provider.id, 'insert']);
    expect(summary.filter(([entity]) => entity === 'provider')).toEqual([
      ['provider', provider.id, 'insert'],
      ['provider', provider.id, 'update'],
      ['provider', provider.id, 'update'],
    ]);
    expect(summary.filter(([entity]) => entity === 'cap_windows').length).toBe(3);
    expect(summary.at(-1)).toEqual(['preferences', owner.owner_id, 'update']);
    expect(recorded.at(-1)?.changed).toBeNull();
  });

  it('writes nothing for a rolled back transaction, and keeps owners apart', async () => {
    const owner = await create_test_owner(app);
    const other = await create_test_owner(app);
    await instructions.create(owner.owner_id, instruction);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.instruction.create({
          data: { owner_id: owner.owner_id, scope: 'global', title: 'Gone', body: 'Rolled back.' },
        });
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await events.bounds(owner.owner_id)).toEqual({ head_seq: 1, oldest_seq: 1 });

    await instructions.create(other.owner_id, instruction);
    expect(await events.list_after(other.owner_id, 0, 10)).toMatchObject([{ seq: 1 }]);
    expect(await events.list_after(owner.owner_id, 0, 10)).toHaveLength(1);
  });

  it('numbers concurrent commits in commit order, so a reader never sees a gap', async () => {
    const owner = await create_test_owner(app);
    const writers = 24;
    let done = false;
    const observed: number[][] = [];
    const reader = (async () => {
      while (!done) {
        observed.push((await events.list_after(owner.owner_id, 0, 1_000)).map((row) => row.seq));
      }
    })();
    await Promise.all(
      Array.from({ length: writers }, (_, index) =>
        prisma.$transaction(async (tx) => {
          await tx.instruction.create({
            data: { owner_id: owner.owner_id, scope: 'global', title: `Rule ${index}`, body: 'x' },
          });
          await tx.$executeRaw`SELECT pg_sleep(${(index % 5) * 0.01})`;
        }),
      ),
    );
    done = true;
    await reader;

    const all = (await events.list_after(owner.owner_id, 0, 1_000)).map((row) => row.seq);
    expect(all).toEqual(Array.from({ length: writers }, (_, index) => index + 1));
    expect(observed.length).toBeGreaterThan(1);
    for (const seqs of observed) {
      expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, index) => index + 1));
    }
  });

  it('notifies the owner after the commit, not before', async () => {
    const owner = await create_test_owner(app);
    const listener = new Client({ connectionString: require_database_url(load_test_config()) });
    const heard: string[] = [];
    await listener.connect();
    listener.on('notification', (message) => {
      if (message.channel === 'tbn_changes' && message.payload !== undefined) {
        heard.push(message.payload);
      }
    });
    await listener.query('LISTEN tbn_changes');
    try {
      let commit = (): void => undefined;
      const committed = prisma.$transaction(async (tx) => {
        await tx.instruction.create({
          data: { owner_id: owner.owner_id, scope: 'global', title: 'Rule', body: 'x' },
        });
        await new Promise<void>((resolve) => {
          commit = resolve;
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(heard).not.toContain(owner.owner_id);
      commit();
      await committed;
      await wait_for('the notification', () => (heard.includes(owner.owner_id) ? true : undefined));
    } finally {
      await listener.end();
    }
  });

  it('prunes events created before a time and keeps the head', async () => {
    const owner = await create_test_owner(app);
    await instructions.create(owner.owner_id, instruction);
    await instructions.create(owner.owner_id, instruction);
    await prisma.event.updateMany({
      where: { owner_id: owner.owner_id, seq: 1 },
      data: { created_at: new Date(0) },
    });
    expect(await events.prune(new Date(1_000))).toBeGreaterThanOrEqual(1);
    expect(await events.bounds(owner.owner_id)).toEqual({ head_seq: 2, oldest_seq: 2 });
  });
});
