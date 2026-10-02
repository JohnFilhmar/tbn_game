import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { INestApplicationContext } from '@nestjs/common';
import {
  BranchReviewSchema,
  MergeRequestSchema,
  RepositorySchema,
  TaskSchema,
  type Repository,
} from '@tbn/contracts';
import { AgentService } from '@/modules/company/services/agent.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { GitJobService, type GitJobAgent } from '@/modules/runtime/services/git/git_job.service';
import { AgentBranchesService } from '@/modules/runtime/services/git/agent_branches.service';
import { repo_subpath } from '@/modules/runtime/services/sandbox/sandbox_job.service';
import type { FakeProviderServer, Responder, ScriptedReply } from '@/testing/fake_provider_server';
import {
  finish_reply,
  read_request,
  subtask_results_seen,
  type RequestView,
} from '@/testing/fake_requests';
import {
  launcher_test_config,
  prepare_test_sandbox,
  start_test_launcher,
} from '@/testing/test_launcher';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';

const exec_file = promisify(execFile);

function tool(name: string, input: Record<string, unknown>): ScriptedReply {
  return { type: 'tool_use', name, input };
}

/** The feature branch the delegate tool named, from its answer. */
function branch_in(text: string): string {
  const match = /works on branch (\S+)\./.exec(text);
  if (match?.[1] === undefined) throw new Error(`No branch in: ${text}`);
  return match[1];
}

/** The job id a run_command answer names. */
function job_in(text: string): string {
  const match = /\(job ([0-9a-f-]+)\)/.exec(text);
  if (match?.[1] === undefined) throw new Error(`No job in: ${text}`);
  return match[1];
}

/** Every tool result an agent saw so far, from the fake's last request for it. */
function results_for(fake: FakeProviderServer, agent_name: string): string[] {
  for (const request of [...fake.requests].reverse()) {
    const view = read_request(request, 'anthropic_messages');
    if (view.agent_name === agent_name) return view.tool_results;
  }
  throw new Error(`No request for ${agent_name}`);
}

/** The manager's script: it builds on its branch, delegates, reviews, merges and asks the owner. */
function manager_steps(view: RequestView): ScriptedReply {
  const results = view.tool_results;
  const step = results.length;
  switch (step) {
    case 0:
      return tool('git_checkout', {});
    case 1:
      return tool('run_command', {
        command:
          'echo "# App" > README.md && git add README.md && git commit -qm "Add README" && git rev-parse --short HEAD',
        cwd: 'app',
      });
    case 2:
      return tool('git_publish', {});
    case 3:
      return tool('delegate_task', {
        title: 'Add greeting',
        instructions: 'Create greeting.txt containing hello, commit it and publish your branch.',
        new_intern_role: 'Developer',
        new_intern_job_description: 'Writes code.',
      });
    case 4:
      if (subtask_results_seen(view) === 0)
        return { type: 'text', text: 'Waiting for the intern.' };
      return tool('git_log', { head: branch_in(results[3] ?? '') });
    case 5:
      return tool('git_diff', { head: branch_in(results[3] ?? '') });
    case 6:
      return tool('git_checkout', { branch: branch_in(results[3] ?? '') });
    case 7:
      return tool('run_command', {
        command: 'test "$(cat greeting.txt)" = hello && echo TESTS_PASS',
        cwd: 'app',
      });
    case 8:
      return tool('review_branch', {
        branch: branch_in(results[3] ?? ''),
        findings: 'The greeting is there and the test passes.',
        verdict: 'approve',
        test_job_id: job_in(results[7] ?? ''),
      });
    case 9:
      return tool('merge_feature_branch', { branch: branch_in(results[3] ?? '') });
    case 10:
      return tool('git_checkout', {});
    case 11:
      return tool('run_command', { command: 'cat greeting.txt && git log --oneline', cwd: 'app' });
    case 12:
      return tool('open_merge_request', {
        notes: 'Adds the greeting. Reviewed and tested.',
        test_job_id: job_in(results[7] ?? ''),
      });
    default:
      return finish_reply('Greeting merged into alice/main and a merge request opened.');
  }
}

/** The intern's script: it works on its feature branch, probes the walls, and publishes. */
function intern_steps(view: RequestView): ScriptedReply {
  switch (view.tool_results.length) {
    case 0:
      return tool('git_checkout', {});
    case 1:
      return tool('run_command', {
        command:
          'echo hello > greeting.txt && git add greeting.txt && git commit -qm "Add greeting" && git log --oneline | head -1',
        cwd: 'app',
      });
    case 2:
      return tool('run_command', {
        command:
          'echo "work: $(ls /work)"; ls /repo 2>&1 | head -1; echo "remotes: $(git -C app remote | wc -l)"; git -C app push 2>&1 | head -1; echo probe_done',
        cwd: '.',
      });
    case 3:
      return tool('git_publish', {});
    case 4:
      return tool('git_checkout', { branch: 'alice/main' });
    default:
      return finish_reply('Added the greeting on my feature branch and published it.');
  }
}

function responder(manager_name: string): Responder {
  return (request) => {
    const view = read_request(request, 'anthropic_messages');
    return view.agent_name === manager_name ? manager_steps(view) : intern_steps(view);
  };
}

describe('git on branches through the sandbox', () => {
  let team: TeamHarness;
  let launcher: INestApplicationContext;
  let repository: Repository;
  let bare: string;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  async function git(...args: string[]): Promise<string> {
    const { stdout } = await exec_file('git', ['-C', bare, ...args]);
    return stdout.trim();
  }

  beforeAll(async () => {
    team = await start_team_harness(launcher_test_config);
    await prepare_test_sandbox(team.config);
    launcher = await start_test_launcher(team.config);
    repository = RepositorySchema.parse(
      (await team.api().post('/repositories').set(auth()).send({ name: 'app' }).expect(201)).body,
    );
    bare = join(team.config.workspace.dir, repo_subpath(team.owner.owner_id, 'app'));
  }, 300_000);

  afterAll(async () => {
    await launcher.close();
    await team.close();
  });

  it('registers an empty repository with its default branch and development', async () => {
    expect(repository).toMatchObject({ name: 'app', remote_url: null, default_branch: 'main' });
    expect(await git('branch', '--list', '--format=%(refname:short)')).toBe('development\nmain');
    expect(await git('log', '--oneline', 'development')).toContain('Initial commit');

    await team.api().get('/repositories').expect(401);
    await team.api().post('/repositories').set(auth()).send({ name: 'app' }).expect(409);
    await team.api().post('/repositories').set(auth()).send({ name: 'Bad Name' }).expect(400);
    const listed = RepositorySchema.array().parse(
      (await team.api().get('/repositories').set(auth()).expect(200)).body,
    );
    expect(listed.map((row) => row.name)).toEqual(['app']);
    await team.api().get(`/repositories/${repository.id}`).set(auth()).expect(200);
    await team.api().get(`/repositories/${randomUUID()}`).set(auth()).expect(404);
    await team.api().post(`/repositories/${repository.id}/fetch`).set(auth()).expect(409);
  });

  it('lets a manager and its intern build on their branches, review, merge and open a merge request the owner merges', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond(responder('Alice'));
    const manager = await team.manager(await team.provider(fake), { name: 'Alice' });
    const task = TaskSchema.parse(
      (
        await team
          .api()
          .post('/tasks')
          .set(auth())
          .send({
            title: 'Build the greeting feature',
            instructions: 'Add a greeting with an intern.',
            assignee_agent_id: manager.id,
            repository_id: repository.id,
          })
          .expect(201)
      ).body,
    );
    await team.wait_for_task(task.id, 'done', 120_000);

    const manager_results = results_for(fake, 'Alice');
    expect(manager_results[0]).toContain('Checked out alice/main of app at');
    expect(manager_results[1]).toContain('Exit code 0');
    expect(manager_results[2]).toContain('Published alice/main of app at');
    const feature = branch_in(manager_results[3] ?? '');
    expect(feature).toMatch(/^alice\/add-greeting-[0-9a-f]{6}$/);
    expect(manager_results[4]).toContain('Add greeting');
    expect(manager_results[5]).toContain('+hello');
    expect(manager_results[6]).toContain(`Checked out ${feature} of app at`);
    expect(manager_results[7]).toContain('TESTS_PASS');
    expect(manager_results[8]).toContain('Recorded review');
    expect(manager_results[9]).toContain(`Merged ${feature} into alice/main as`);
    expect(manager_results[11]).toContain('hello\n');
    expect(manager_results[11]).toContain('Merge alice/add-greeting');
    expect(manager_results[12]).toContain('Opened merge request');

    const intern = (await team.agents({ level: '2' })).find((agent) => agent.id !== manager.id);
    if (intern === undefined) throw new Error('No intern');
    const intern_results = results_for(fake, intern.name);
    expect(intern_results[0]).toContain(`Checked out ${feature} of app at`);
    expect(intern_results[1]).toContain('Add greeting');
    expect(intern_results[2]).toContain('work: app\n');
    expect(intern_results[2]).toContain('No such file or directory');
    expect(intern_results[2]).toContain('remotes: 0');
    expect(intern_results[2]).toContain('fatal:');
    expect(intern_results[2]).toContain('probe_done');
    expect(intern_results[3]).toContain(`Published ${feature} of app at`);
    expect(intern_results[4]).toContain('Interns work on the feature branch of their task only.');

    const reviews = BranchReviewSchema.array().parse(
      (await team.api().get('/branch_reviews').query({ branch: feature }).set(auth()).expect(200))
        .body,
    );
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ verdict: 'approve', reviewer_agent_id: manager.id });

    const requests = MergeRequestSchema.array().parse(
      (await team.api().get('/merge_requests').query({ status: 'open' }).set(auth()).expect(200))
        .body,
    );
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request === undefined) throw new Error('No merge request');
    expect(request).toMatchObject({
      source_branch: 'alice/main',
      target_branch: 'development',
      agent_id: manager.id,
      review_notes: 'Adds the greeting. Reviewed and tested.',
    });
    expect(request.diff).toContain('greeting.txt');
    expect(request.log).toContain('Add greeting');
    expect(request.test_output).toContain('TESTS_PASS');
    expect(await git('log', '--oneline', 'development')).not.toContain('Add greeting');

    await team.api().post(`/merge_requests/${request.id}/merge`).expect(401);
    const merged = MergeRequestSchema.parse(
      (await team.api().post(`/merge_requests/${request.id}/merge`).set(auth()).expect(200)).body,
    );
    expect(merged.status).toBe('merged');
    expect(merged.merge_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await git('rev-parse', 'development')).toBe(merged.merge_sha);
    expect(await git('log', '--oneline', 'development')).toContain('Add greeting');
    expect(await git('show', 'development:greeting.txt')).toBe('hello');
    await team.api().post(`/merge_requests/${request.id}/merge`).set(auth()).expect(409);
    await team.api().post(`/merge_requests/${request.id}/close`).set(auth()).expect(409);
    await team.api().get(`/merge_requests/${request.id}`).set(auth()).expect(200);
    await team.api().get(`/merge_requests/${randomUUID()}`).set(auth()).expect(404);
  });

  it('refuses writes to the manager branch, development, staging and the default branch for every agent', async () => {
    const git_jobs = team.worker.get(GitJobService);
    const branches = team.worker.get(AgentBranchesService);
    const agents = team.worker.get(AgentService);
    const manager = await agents.find_by_name(team.owner.owner_id, 'Alice');
    const intern = (await team.agents({ level: '2' })).find((agent) => agent.name !== 'Alice');
    if (manager === null || intern === undefined) throw new Error('No team');
    const intern_record = await agents.require(team.owner.owner_id, intern.id);
    const repo = {
      ...repository,
      created_at: new Date(),
      updated_at: new Date(),
      owner_id: team.owner.owner_id,
    };
    const runs = team.worker.get<RunRepository>(RUN_REPOSITORY);
    const worker_for = async (agent: typeof manager): Promise<GitJobAgent> => ({
      origin: { run_id: (await runs.create(team.owner.owner_id, agent.id, null)).id, agent },
      agent,
    });

    expect(await branches.publishable(manager, repository.id)).toEqual(['alice/main']);
    const intern_allowed = await branches.publishable(intern_record, repository.id);
    expect(intern_allowed).toEqual([]);
    for (const branch of ['alice/main', 'development', 'staging', 'main']) {
      const result = await git_jobs.publish(
        team.owner.owner_id,
        repo,
        await worker_for(intern_record),
        branch,
        intern_allowed,
      );
      expect(result.outcome).toBe('refused');
    }
    for (const branch of ['development', 'staging', 'main']) {
      const result = await git_jobs.publish(
        team.owner.owner_id,
        repo,
        await worker_for(manager),
        branch,
        ['alice/main'],
      );
      expect(result.outcome).toBe('refused');
    }
  });

  it('deletes the repository and its canonical copy', async () => {
    await team.api().delete(`/repositories/${repository.id}`).set(auth()).expect(204);
    await team.api().get(`/repositories/${repository.id}`).set(auth()).expect(404);
    await expect(access(bare)).rejects.toThrow();
  });
});
