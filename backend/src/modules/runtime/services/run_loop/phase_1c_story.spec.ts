import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { INestApplicationContext } from '@nestjs/common';
import {
  ApprovalSchema,
  IntegrationSchema,
  MergeRequestSchema,
  ReportSchema,
  RepositorySchema,
  RunSourceSchema,
  TaskSchema,
} from '@tbn/contracts';
import { repo_subpath } from '@/modules/runtime/services/sandbox/sandbox_job.service';
import type { FakeProviderServer, ScriptedReply } from '@/testing/fake_provider_server';
import {
  finish_reply,
  read_request,
  subtask_results_seen,
  type RequestView,
} from '@/testing/fake_requests';
import { start_fake_search_server, type FakeSearchServer } from '@/testing/fake_search_server';
import { start_fake_webhook_server, type FakeWebhookServer } from '@/testing/fake_webhook_server';
import { load_test_config } from '@/testing/test_app';
import {
  launcher_test_config,
  prepare_test_sandbox,
  start_test_launcher,
} from '@/testing/test_launcher';
import {
  ALLOWED_HOST,
  start_test_proxy,
  start_test_upstream,
  type TestProxy,
  type TestUpstream,
} from '@/testing/test_proxy';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';
import { wait_for } from '@/testing/wait_for';

const exec_file = promisify(execFile);
const ARTICLE = `http://${ALLOWED_HOST}/article`;

function tool(name: string, input: Record<string, unknown>): ScriptedReply {
  return { type: 'tool_use', name, input };
}

function branch_in(text: string): string {
  const match = /works on branch (\S+)\./.exec(text);
  if (match?.[1] === undefined) throw new Error(`No branch in: ${text}`);
  return match[1];
}

function job_in(text: string): string {
  const match = /\(job ([0-9a-f-]+)\)/.exec(text);
  if (match?.[1] === undefined) throw new Error(`No job in: ${text}`);
  return match[1];
}

/**
 * The manager's story: research on the web twice over, a feature built by an intern on a branch,
 * reviewed, tested and merged, a merge request for the owner, a ticket through an integration,
 * and one report.
 */
function manager_steps(view: RequestView): ScriptedReply {
  const results = view.tool_results;
  switch (results.length) {
    case 0:
      return tool('search_library', { query: 'pelicans' });
    case 1:
      return tool('web_search', { query: 'pelican facts' });
    case 2:
      return tool('web_search', { query: 'pelican facts' });
    case 3:
      return tool('fetch_url', { url: ARTICLE });
    case 4:
      return tool('fetch_url', { url: ARTICLE });
    case 5:
      return tool('git_checkout', {});
    case 6:
      return tool('delegate_task', {
        title: 'Add the pelican note',
        instructions: 'Create pelican.txt with the pouch fact, commit and publish.',
        new_intern_role: 'Developer',
        new_intern_job_description: 'Writes code.',
      });
    case 7:
      if (subtask_results_seen(view) === 0)
        return { type: 'text', text: 'Waiting for the intern.' };
      return tool('git_checkout', { branch: branch_in(results[6] ?? '') });
    case 8:
      return tool('run_command', {
        command: 'grep -q gallons pelican.txt && echo TESTS_PASS',
        cwd: 'app',
      });
    case 9:
      return tool('review_branch', {
        branch: branch_in(results[6] ?? ''),
        findings: 'The note is there and the test passes.',
        verdict: 'approve',
        test_job_id: job_in(results[8] ?? ''),
      });
    case 10:
      return tool('merge_feature_branch', { branch: branch_in(results[6] ?? '') });
    case 11:
      return tool('open_merge_request', {
        notes: 'Adds the pelican note from the research.',
        test_job_id: job_in(results[8] ?? ''),
      });
    case 12:
      return tool('call_ticket_desk', { summary: 'Pelican note merged, please review' });
    default:
      return finish_reply('Researched pelicans, merged the note and asked for a ticket.');
  }
}

function intern_steps(view: RequestView): ScriptedReply {
  switch (view.tool_results.length) {
    case 0:
      return tool('git_checkout', {});
    case 1:
      return tool('run_command', {
        command:
          'echo "The pelican pouch holds three gallons." > pelican.txt && git add pelican.txt && git commit -qm "Add the pelican note" && echo committed',
        cwd: 'app',
      });
    case 2:
      return tool('git_publish', {});
    default:
      return finish_reply('Added the pelican note on my branch.');
  }
}

function results_for(fake: FakeProviderServer, agent_name: string): string[] {
  for (const request of [...fake.requests].reverse()) {
    const view = read_request(request, 'anthropic_messages');
    if (view.agent_name === agent_name) return view.tool_results;
  }
  throw new Error(`No request for ${agent_name}`);
}

describe('phase 1c, the outside world', () => {
  let upstream: TestUpstream;
  let proxy: TestProxy;
  let search: FakeSearchServer;
  let webhook: FakeWebhookServer;
  let team: TeamHarness;
  let launcher: INestApplicationContext;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  beforeAll(async () => {
    upstream = await start_test_upstream();
    proxy = await start_test_proxy(load_test_config(), upstream);
    search = await start_fake_search_server();
    webhook = await start_fake_webhook_server();
    team = await start_team_harness((config) =>
      launcher_test_config({ ...config, egress: { ...config.egress, url: proxy.url } }),
    );
    await prepare_test_sandbox(team.config);
    launcher = await start_test_launcher(team.config);
  }, 300_000);

  afterAll(async () => {
    await launcher.close();
    await team.close();
    await webhook.close();
    await search.close();
    await proxy.close();
    await upstream.close();
  });

  it('runs the exit story end to end', async () => {
    await team
      .api()
      .post('/search_providers')
      .set(auth())
      .send({ type: 'searxng', name: 'Local', base_url: search.base_url })
      .expect(201);
    const repository = RepositorySchema.parse(
      (await team.api().post('/repositories').set(auth()).send({ name: 'app' }).expect(201)).body,
    );
    const integration = IntegrationSchema.parse(
      (
        await team
          .api()
          .post('/integrations')
          .set(auth())
          .send({
            name: 'Ticket Desk',
            method: 'POST',
            url: `${webhook.base_url}/tickets`,
            headers: { Authorization: 'Bearer {{token}}' },
            token: 'ticket-token',
            body_format: 'json',
            body_template: '{"summary": "{{summary}}"}',
            placeholders: [{ name: 'summary', description: 'The summary', required: true }],
          })
          .expect(201)
      ).body,
    );

    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => {
      const view = read_request(request, 'anthropic_messages');
      return view.agent_name === 'Alice' ? manager_steps(view) : intern_steps(view);
    });
    const manager = await team.manager(await team.provider(fake), { name: 'Alice' });
    await team
      .api()
      .post(`/agents/${manager.id}/integrations/${integration.id}`)
      .set(auth())
      .expect(201);
    const task = TaskSchema.parse(
      (
        await team
          .api()
          .post('/tasks')
          .set(auth())
          .send({
            title: 'Research pelicans and add a note to the app',
            instructions:
              'Search the web, write what you learn into the app with an intern, and file a ticket.',
            assignee_agent_id: manager.id,
            repository_id: repository.id,
          })
          .expect(201)
      ).body,
    );

    const approval = await wait_for(
      'the integration call to wait for the owner',
      async () => {
        const rows = ApprovalSchema.array().parse(
          (
            await team
              .api()
              .get('/approvals')
              .query({ status: 'pending', agent_id: manager.id })
              .set(auth())
              .expect(200)
          ).body,
        );
        return rows[0];
      },
      { timeout_ms: 120_000, interval_ms: 500 },
    );
    expect(approval).toMatchObject({ tool_name: 'call_ticket_desk', kind: 'tool_call' });
    expect(approval.sources.map((source) => [source.kind, source.cached])).toEqual([
      ['search', false],
      ['search', true],
      ['fetch', false],
      ['fetch', true],
    ]);
    await team.wait_for_task(task.id, 'awaiting_approval');
    expect(webhook.requests).toHaveLength(0);

    await team.api().post(`/approvals/${approval.id}/approve`).set(auth()).expect(200);
    const done = await team.wait_for_task(task.id, 'done', 60_000);
    expect(done.report_id).not.toBeNull();
    expect(webhook.requests).toHaveLength(1);
    expect(JSON.parse(webhook.requests[0]?.body ?? '{}')).toEqual({
      summary: 'Pelican note merged, please review',
    });

    const results = results_for(fake, 'Alice');
    expect(results[0]).toContain('The library has nothing on');
    expect(results[1]).toContain('From Local.');
    expect(results[2]).toContain('From the cache.');
    expect(results[3]).toContain('Fetched just now.');
    expect(results[4]).toContain('From the cache');
    expect(search.requests).toHaveLength(1);
    expect(upstream.requests.filter((item) => item.url === '/article')).toHaveLength(1);
    expect(results[8]).toContain('TESTS_PASS');
    expect(results[10]).toContain('Merged');
    expect(results[11]).toContain('Opened merge request');
    expect(results[12]).toContain('HTTP 200');

    const [request] = MergeRequestSchema.array().parse(
      (await team.api().get('/merge_requests').query({ status: 'open' }).set(auth()).expect(200))
        .body,
    );
    if (request === undefined) throw new Error('No merge request');
    expect(request.diff).toContain('pelican.txt');
    const merged = MergeRequestSchema.parse(
      (await team.api().post(`/merge_requests/${request.id}/merge`).set(auth()).expect(200)).body,
    );
    const bare = join(team.config.workspace.dir, repo_subpath(team.owner.owner_id, 'app'));
    const { stdout } = await exec_file('git', ['-C', bare, 'show', 'development:pelican.txt']);
    expect(stdout.trim()).toBe('The pelican pouch holds three gallons.');
    expect(merged.merge_sha).toMatch(/^[0-9a-f]{40}$/);

    const report = ReportSchema.parse(
      (
        await team
          .api()
          .get(`/reports/${done.report_id ?? ''}`)
          .set(auth())
          .expect(200)
      ).body,
    );
    expect(report.body_md).toContain('Researched pelicans');
    expect(report.body_md).toContain('Add the pelican note');

    const [run] = await team.runs(manager.id);
    const sources = RunSourceSchema.array().parse(
      (
        await team
          .api()
          .get(`/runs/${run?.id ?? ''}/sources`)
          .set(auth())
          .expect(200)
      ).body,
    );
    expect(sources).toHaveLength(4);
    expect(run?.tainted_at).not.toBeNull();
  });
});
