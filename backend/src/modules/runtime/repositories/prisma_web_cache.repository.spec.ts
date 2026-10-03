import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/lib/database/prisma.service';
import {
  REPORT_REPOSITORY,
  type ReportRepository,
} from '@/modules/company/repositories/interface/report_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { RUN_REPOSITORY, type RunRepository } from './interface/run_repository.interface';
import {
  RUN_SOURCE_REPOSITORY,
  type RunSourceRepository,
} from './interface/run_source_repository.interface';
import {
  WEB_CACHE_REPOSITORY,
  type WebCacheRepository,
} from './interface/web_cache_repository.interface';

const DAY = new Date(Date.UTC(2026, 9, 2));
const LONG_AGO = new Date(0);

describe('the web caches, the library index and run sources', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let cache: WebCacheRepository;
  let reports: ReportRepository;
  let runs: RunRepository;
  let sources: RunSourceRepository;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    cache = app.get<WebCacheRepository>(WEB_CACHE_REPOSITORY);
    reports = app.get<ReportRepository>(REPORT_REPOSITORY);
    runs = app.get<RunRepository>(RUN_REPOSITORY);
    sources = app.get<RunSourceRepository>(RUN_SOURCE_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores searches by key within the owner and honours the lifetime', async () => {
    const results = [{ title: 'A', url: 'https://example.com/a', snippet: 'about a' }];
    const stored = await cache.store_search(owner.owner_id, null, 'key one', 'Key One', results);
    expect(stored.results).toEqual(results);
    expect(await cache.find_search(owner.owner_id, 'key one', LONG_AGO)).toMatchObject({
      query: 'Key One',
    });
    expect(await cache.find_search(other.owner_id, 'key one', LONG_AGO)).toBeNull();
    expect(
      await cache.find_search(owner.owner_id, 'key one', new Date(Date.now() + 60_000)),
    ).toBeNull();
    const replaced = await cache.store_search(owner.owner_id, null, 'key one', 'key one', []);
    expect(replaced.id).toBe(stored.id);
    expect(replaced.results).toEqual([]);
  });

  it('stores pages by URL within the owner and indexes them for the library', async () => {
    const page = await cache.store_fetch(owner.owner_id, {
      url: 'https://example.com/pelicans',
      title: 'All about pelicans',
      content_type: 'text/html',
      text: 'Pelicans are large water birds with a famous pouch under the beak.',
      bytes: 1_234,
    });
    expect(await cache.find_fetch(owner.owner_id, page.url, LONG_AGO)).toMatchObject({
      id: page.id,
      bytes: 1_234,
    });
    expect(await cache.find_fetch(other.owner_id, page.url, LONG_AGO)).toBeNull();
    expect(
      await cache.find_fetch(owner.owner_id, page.url, new Date(Date.now() + 60_000)),
    ).toBeNull();
    const again = await cache.store_fetch(owner.owner_id, { ...page, text: 'Pelicans, revised.' });
    expect(again.id).toBe(page.id);

    const hits = await cache.search_pages(owner.owner_id, 'pelicans', 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ url: page.url, title: 'All about pelicans' });
    expect(hits[0]?.excerpt).toContain('<b>Pelicans</b>');
    expect(await cache.search_pages(owner.owner_id, 'penguins', 5)).toEqual([]);
    expect(await cache.search_pages(other.owner_id, 'pelicans', 5)).toEqual([]);
  });

  it('counts hits, misses and bytes per day and sums them', async () => {
    await cache.count_event(owner.owner_id, 'search', DAY, { hits: 1, misses: 0, bytes_saved: 0 });
    await cache.count_event(owner.owner_id, 'search', DAY, { hits: 0, misses: 2, bytes_saved: 0 });
    await cache.count_event(owner.owner_id, 'fetch', DAY, { hits: 3, misses: 1, bytes_saved: 500 });
    await cache.count_event(owner.owner_id, 'fetch', new Date(Date.UTC(2026, 9, 3)), {
      hits: 1,
      misses: 0,
      bytes_saved: 250,
    });
    await cache.count_event(other.owner_id, 'fetch', DAY, { hits: 9, misses: 9, bytes_saved: 9 });
    expect(await cache.event_totals(owner.owner_id)).toEqual({
      search: { hits: 1, misses: 2 },
      fetch: { hits: 4, misses: 1, bytes_saved: 750 },
    });
    const all = await cache.event_totals_by_kind();
    expect(all.map((total) => total.kind)).toEqual(['fetch', 'search']);
    const fetch = all.find((total) => total.kind === 'fetch');
    expect(fetch?.hits).toBeGreaterThanOrEqual(13);
    expect(fetch?.misses).toBeGreaterThanOrEqual(10);
  });

  it('indexes reports when they are written and finds them', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const task = await app.get(PrismaService).task.create({
      data: {
        owner_id: owner.owner_id,
        title: 'Pelican report',
        instructions: 'Write it.',
        assignee_agent_id: agent.id,
      },
    });
    const report = await reports.create(
      owner.owner_id,
      task.id,
      agent.id,
      '# Pelicans\n\nThe pelican pouch holds three gallons of water.',
    );
    const hits = await reports.search(owner.owner_id, 'pelican pouch', 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: report.id, task_id: task.id, agent_id: agent.id });
    expect(hits[0]?.excerpt).toContain('<b>pouch</b>');
    expect(await reports.search(other.owner_id, 'pelican', 5)).toEqual([]);
    expect(await reports.search(owner.owner_id, 'penguins', 5)).toEqual([]);
  });

  it('records what a run read and taints it once', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const run = await runs.create(owner.owner_id, agent.id, null);
    expect(run.tainted_at).toBeNull();
    await sources.record(owner.owner_id, {
      run_id: run.id,
      kind: 'fetch',
      reference: 'https://example.com/',
      cached: false,
    });
    const first = new Date('2026-10-02T10:00:00Z');
    await runs.mark_tainted(owner.owner_id, run.id, first);
    await runs.mark_tainted(owner.owner_id, run.id, new Date());
    await runs.mark_tainted(other.owner_id, run.id, new Date());
    expect((await runs.find(owner.owner_id, run.id))?.tainted_at).toEqual(first);
    expect(await sources.list(owner.owner_id, run.id)).toMatchObject([
      { kind: 'fetch', reference: 'https://example.com/', cached: false },
    ]);
    expect(await sources.list(other.owner_id, run.id)).toEqual([]);

    const second = await sources.record(owner.owner_id, {
      run_id: run.id,
      kind: 'search',
      reference: 'pelicans',
      cached: true,
    });
    const [first_source] = await sources.list(owner.owner_id, run.id);
    if (first_source === undefined) throw new Error('No source');
    expect(
      (await sources.list_by_ids(owner.owner_id, [second.id, first_source.id])).map(
        (source) => source.reference,
      ),
    ).toEqual(['https://example.com/', 'pelicans']);
    expect(await sources.list_by_ids(other.owner_id, [second.id])).toEqual([]);
  });
});
