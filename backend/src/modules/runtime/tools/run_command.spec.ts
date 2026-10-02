import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { SandboxJobSchema } from '@tbn/contracts';
import type { ScriptedReply } from '@/testing/fake_provider_server';
import { finish_reply, read_request, type RequestView } from '@/testing/fake_requests';
import {
  launcher_test_config,
  prepare_test_sandbox,
  start_test_launcher,
} from '@/testing/test_launcher';
import { start_team_harness, type TeamHarness } from '@/testing/team_harness';

/** Tries to leave the checkout, then runs a real command, then finishes. */
function command_reply(view: RequestView): ScriptedReply {
  if (view.last.startsWith('Exit code')) return finish_reply('Ran it.');
  if (view.last.startsWith('cwd must stay')) {
    return {
      type: 'tool_use',
      name: 'run_command',
      input: { command: 'echo hello > note.txt && cat note.txt && id -u && pwd' },
    };
  }
  return {
    type: 'tool_use',
    name: 'run_command',
    input: { command: 'cat /etc/passwd', cwd: '../../etc' },
  };
}

describe('run_command', () => {
  let team: TeamHarness;
  let launcher: INestApplicationContext;
  const auth = (): Record<string, string> => ({ Authorization: `Bearer ${team.owner.token}` });

  beforeAll(async () => {
    team = await start_team_harness(launcher_test_config);
    await prepare_test_sandbox(team.config);
    launcher = await start_test_launcher(team.config);
  }, 300_000);

  afterAll(async () => {
    await launcher.close();
    await team.close();
  });

  it('runs the command in the agent checkout and records the job', async () => {
    const fake = await team.fake('anthropic_messages');
    fake.respond((request) => command_reply(read_request(request, 'anthropic_messages')));
    const manager = await team.manager(await team.provider(fake));
    const task = await team.assign(manager, 'Run a command');
    await team.wait_for_task(task.id, 'done', 60_000);

    const transcript = JSON.stringify(await team.transcript(manager.id));
    expect(transcript).toContain('cwd must stay inside the checkout directory');
    expect(transcript).toContain(`hello\\n${team.config.sandbox.uid}\\n/work\\n`);
    expect(transcript).toContain('Exit code 0 after');

    const listed = SandboxJobSchema.array().parse(
      (
        await team
          .api()
          .get('/sandbox_jobs')
          .query({ agent_id: manager.id })
          .set(auth())
          .expect(200)
      ).body,
    );
    expect(listed).toHaveLength(1);
    const job = listed[0];
    if (job === undefined) throw new Error('No job listed');
    expect(job).toMatchObject({
      kind: 'agent',
      status: 'done',
      exit_code: 0,
      agent_id: manager.id,
      stdout: `hello\n${team.config.sandbox.uid}\n/work\n`,
    });
    expect(job.spec.argv).toEqual([
      'bash',
      '-lc',
      'echo hello > note.txt && cat note.txt && id -u && pwd',
    ]);
    expect(job.spec.mounts.map((mount) => mount.target)).toEqual(['/work', '/files']);
    expect(job.spec.env['HTTPS_PROXY']).toBe(
      `http://${job.run_id}:${manager.id}@egress_proxy:3128/`,
    );
    expect(JSON.stringify(job)).not.toContain('sk-test-team');

    const one = SandboxJobSchema.parse(
      (await team.api().get(`/sandbox_jobs/${job.id}`).set(auth()).expect(200)).body,
    );
    expect(one.id).toBe(job.id);
    await team.api().get(`/sandbox_jobs/${job.id}`).expect(401);
    await team.api().get('/sandbox_jobs').expect(401);
    await team.api().get(`/sandbox_jobs/${randomUUID()}`).set(auth()).expect(404);
    await team.api().get('/sandbox_jobs').query({ status: 'nope' }).set(auth()).expect(400);
  });
});
