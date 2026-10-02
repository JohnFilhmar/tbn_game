import { randomUUID } from 'node:crypto';
import { CacheStatsSchema, RunSourceSchema, type Run } from '@tbn/contracts';
import type { FakeProviderServer, Responder, ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request } from '@/testing/fake_requests';
import { start_fake_search_server, type FakeSearchServer } from '@/testing/fake_search_server';
import { load_test_config } from '@/testing/test_app';
import {
  ALLOWED_HOST,
  start_test_proxy,
  start_test_upstream,
  type TestProxy,
  type TestUpstream,
} from '@/testing/test_proxy';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';

const ARTICLE = `http://${ALLOWED_HOST}/article`;

/** Answers the model's turns from a script, one tool call per turn, then finishes. */
function scripted(steps: ScriptedReply[], outcome: string): Responder {
  return (request) => {
    const view = read_request(request, 'anthropic_messages');
    return steps[view.tool_results.length] ?? finish_reply(outcome);
  };
}

function tool(name: string, input: Record<string, unknown>): ScriptedReply {
  return { type: 'tool_use', name, input };
}

/** The tool results the fake saw in its last request, oldest first. */
function last_results(fake: FakeProviderServer): string[] {
  const last = fake.requests.at(-1);
  if (last === undefined) throw new Error('The fake provider saw no request');
  return read_request(last, 'anthropic_messages').tool_results;
}

describe('web_search, fetch_url and search_library', () => {
  let upstream: TestUpstream;
  let proxy: TestProxy;
  let search: FakeSearchServer;
  let team: TeamHarness;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  async function run_of(agent_id: string): Promise<Run> {
    const runs = await team.runs(agent_id);
    const run = runs[0];
    if (run === undefined) throw new Error('No run');
    return run;
  }

  beforeAll(async () => {
    upstream = await start_test_upstream();
    proxy = await start_test_proxy(load_test_config(), upstream);
    search = await start_fake_search_server();
    team = await start_team_harness((config) => ({
      ...config,
      egress: { ...config.egress, url: proxy.url },
    }));
    for (const body of [
      {
        type: 'brave',
        name: 'Brave',
        base_url: search.base_url,
        api_key: 'BSA-test',
        priority: 1,
        price_per_thousand_requests: 5,
      },
      { type: 'searxng', name: 'Local', base_url: search.base_url, priority: 2 },
    ]) {
      await team.api().post('/search_providers').set(auth()).send(body).expect(201);
    }
  });

  afterAll(async () => {
    await team.close();
    await search.close();
    await proxy.close();
    await upstream.close();
  });

  it('searches once per query, reads a page once per lifetime, and records what the run read', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond(
      scripted(
        [
          tool('web_search', { query: 'pelican facts', max_results: 2 }),
          tool('web_search', { query: '  Pelican   FACTS ' }),
          tool('fetch_url', { url: `${ARTICLE}#intro` }),
          tool('fetch_url', { url: ARTICLE }),
          tool('fetch_url', { url: ARTICLE, fresh: true }),
          tool('fetch_url', { url: `http://${ALLOWED_HOST}/redirect` }),
          tool('fetch_url', { url: `http://${ALLOWED_HOST}/image` }),
          tool('fetch_url', { url: 'http://169.254.169.254/latest/meta-data/' }),
        ],
        'Pelicans researched.',
      ),
    );
    const manager = await team.manager(await team.provider(fake));
    const task = await team.assign(manager, 'Research pelicans');
    await team.wait_for_task(task.id, 'done', 60_000);

    const results = last_results(fake);
    expect(results[0]).toContain('From Brave.');
    expect(results[0]).toContain('1. Brave result for pelican facts');
    expect(results[0]).toContain('pelican facts explained by');
    expect(results[0]).not.toContain('<strong>');
    expect(results[1]).toContain('From the cache.');
    expect(results[1]).toContain('Brave result for pelican facts');
    expect(search.requests.filter((r) => r.path === '/res/v1/web/search')).toHaveLength(1);
    expect(search.requests[0]?.headers['x-subscription-token']).toBe('BSA-test');

    expect(results[2]).toContain(`URL: ${ARTICLE}`);
    expect(results[2]).toContain('Title: Pelican article');
    expect(results[2]).toContain('Fetched just now.');
    expect(results[2]).toContain('The pelican pouch holds three gallons of water.');
    expect(results[2]).not.toContain('var x');
    expect(results[2]).not.toContain('<p>');
    expect(results[3]).toContain('From the cache, fetched at');
    expect(results[4]).toContain('Fetched just now.');
    expect(results[5]).toContain('Title: Pelican article');
    expect(results[6]).toContain('image/png');
    expect(results[7]).toContain('refused');
    expect(upstream.requests.filter((r) => r.url === '/article')).toHaveLength(3);

    const run = await run_of(manager.id);
    expect(run.tainted_at).not.toBeNull();
    const sources = RunSourceSchema.array().parse(
      (await team.api().get(`/runs/${run.id}/sources`).set(auth()).expect(200)).body,
    );
    expect(sources.map((source) => [source.kind, source.reference, source.cached])).toEqual([
      ['search', 'pelican facts', false],
      ['search', 'Pelican   FACTS', true],
      ['fetch', ARTICLE, false],
      ['fetch', ARTICLE, true],
      ['fetch', ARTICLE, false],
      ['fetch', `http://${ALLOWED_HOST}/redirect`, false],
    ]);
    await team.api().get(`/runs/${run.id}/sources`).expect(401);
    await team.api().get(`/runs/${randomUUID()}/sources`).set(auth()).expect(404);

    const stats = CacheStatsSchema.parse(
      (await team.api().get('/caches/stats').set(auth()).expect(200)).body,
    );
    expect(stats.search).toEqual({
      hits: 1,
      misses: 1,
      hit_rate: 0.5,
      requests_saved: 1,
      money_saved: 0.005,
    });
    expect(stats.fetch).toMatchObject({ hits: 1, misses: 5 });
    expect(stats.fetch.bytes_saved).toBeGreaterThan(100);
    await team.api().get('/caches/stats').expect(401);
  });

  it('falls back to the next provider when the first fails, and reports when none answers', async () => {
    search.fail_with(429, '/res/v1/web/search');
    const fake = await team.fake('anthropic_messages');
    fake.respond(scripted([tool('web_search', { query: 'backup query' })], 'Searched.'));
    const manager = await team.manager(await team.provider(fake));
    const task = await team.assign(manager, 'Search with a failing primary');
    await team.wait_for_task(task.id, 'done', 60_000);
    const results = last_results(fake);
    expect(results[0]).toContain('From Local.');
    expect(results[0]).toContain('SearXNG result for backup query');
    expect(results[0]).not.toContain('Not a URL');

    search.fail_with(500);
    const none = await team.fake('anthropic_messages');
    none.respond(scripted([tool('web_search', { query: 'nobody answers' })], 'Gave up.'));
    const other = await team.manager(await team.provider(none));
    const failing = await team.assign(other, 'Search with every provider failing');
    await team.wait_for_task(failing.id, 'done', 60_000);
    const failed = last_results(none);
    expect(failed[0]).toContain('No search provider answered.');
    expect(failed[0]).toContain('Brave: HTTP 500');
    expect(failed[0]).toContain('Local: HTTP 500');
    search.fail_with(0);
  });

  it('finds cached pages and reports in the library, and a cached page still taints the run', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond(
      scripted(
        [
          tool('search_library', { query: 'pelicans' }),
          tool('search_library', { query: 'penguins' }),
          tool('fetch_url', { url: ARTICLE }),
        ],
        'Read from the library.',
      ),
    );
    const manager = await team.manager(await team.provider(fake));
    const task = await team.assign(manager, 'Use the library');
    await team.wait_for_task(task.id, 'done', 60_000);
    const results = last_results(fake);
    expect(results[0]).toContain('[page] Pelican article');
    expect(results[0]).toContain(ARTICLE);
    expect(results[0]).toContain('<b>Pelicans</b>');
    expect(results[0]).toContain('[report] Report of task');
    expect(results[1]).toBe('The library has nothing on "penguins".');
    expect(results[2]).toContain('From the cache');
    expect(upstream.requests.filter((r) => r.url === '/article')).toHaveLength(3);

    const run = await run_of(manager.id);
    expect(run.tainted_at).not.toBeNull();
    const sources = RunSourceSchema.array().parse(
      (await team.api().get(`/runs/${run.id}/sources`).set(auth()).expect(200)).body,
    );
    expect(sources.map((source) => [source.kind, source.cached])).toEqual([
      ['library', true],
      ['fetch', true],
    ]);
  });
});
