import type { NestExpressApplication } from '@nestjs/platform-express';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  APPROVAL_REPOSITORY,
  type ApprovalRepository,
} from './interface/approval_repository.interface';
import { RUN_REPOSITORY, type RunRepository } from './interface/run_repository.interface';

describe('PrismaApprovalRepository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let approvals: ApprovalRepository;
  let run_id: string;
  let agent_id: string;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    approvals = app.get<ApprovalRepository>(APPROVAL_REPOSITORY);
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    agent_id = (await recruit_test_agent(app, owner.owner_id, provider.id)).id;
    run_id = (await app.get<RunRepository>(RUN_REPOSITORY).create(owner.owner_id, agent_id, null))
      .id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps approvals within the owner, finds them by call and by run, and decides each once', async () => {
    const call = await approvals.create(owner.owner_id, {
      run_id,
      agent_id,
      task_id: null,
      kind: 'tool_call',
      tool_name: 'call_slack',
      tool_use_id: 'toolu_1',
      payload: { text: 'hello', nested: { n: 1, list: [null, 'x'] } },
      preview: 'POST https://slack.example {"text":"hello"}',
      sources: [{ kind: 'fetch', reference: 'https://example.com/', cached: false }],
    });
    expect(call).toMatchObject({ status: 'pending', note: null, decided_at: null });
    expect(call.payload).toEqual({ text: 'hello', nested: { n: 1, list: [null, 'x'] } });
    const guard = await approvals.create(owner.owner_id, {
      run_id,
      agent_id,
      task_id: null,
      kind: 'runaway_guard',
      tool_name: null,
      tool_use_id: null,
      payload: { guard_turns: 20 },
      preview: null,
      sources: [],
    });

    expect((await approvals.latest_for_call(owner.owner_id, run_id, 'toolu_1'))?.id).toBe(call.id);
    expect(await approvals.latest_for_call(other.owner_id, run_id, 'toolu_1')).toBeNull();
    expect((await approvals.pending_for_run(owner.owner_id, run_id)).map((row) => row.id)).toEqual([
      call.id,
      guard.id,
    ]);
    expect(
      (await approvals.pending_for_run(owner.owner_id, run_id, 'runaway_guard')).map(
        (row) => row.id,
      ),
    ).toEqual([guard.id]);
    expect(await approvals.pending_for_run(other.owner_id, run_id)).toEqual([]);
    expect(
      (await approvals.list(owner.owner_id, { status: 'pending' })).map((row) => row.id),
    ).toEqual([guard.id, call.id]);
    expect(await approvals.list(other.owner_id, {})).toEqual([]);
    expect(await approvals.find(other.owner_id, call.id)).toBeNull();

    expect(await approvals.decide(other.owner_id, call.id, 'approved', null)).toBeNull();
    const decided = await approvals.decide(owner.owner_id, call.id, 'denied', 'Not now');
    expect(decided).toMatchObject({ status: 'denied', note: 'Not now' });
    expect(decided?.decided_at).not.toBeNull();
    expect(await approvals.decide(owner.owner_id, call.id, 'approved', null)).toBeNull();
    expect((await approvals.pending_for_run(owner.owner_id, run_id)).map((row) => row.id)).toEqual([
      guard.id,
    ]);
    expect((await approvals.latest_for_call(owner.owner_id, run_id, 'toolu_1'))?.status).toBe(
      'denied',
    );
  });
});
