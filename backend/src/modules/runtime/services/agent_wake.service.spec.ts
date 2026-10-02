import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import { PrismaService } from '@/lib/database/prisma.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import { AgentWakeService } from './agent_wake.service';

describe('AgentWakeService', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cancels a run that never became active only once it is older than a lease', async () => {
    const runs = app.get<RunRepository>(RUN_REPOSITORY);
    const lease_seconds = app.get<AppConfig>(APP_CONFIG).worker.run_lease_seconds;
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const young = await runs.create(owner.owner_id, agent.id, null);
    const old = await runs.create(owner.owner_id, agent.id, null);
    await app.get(PrismaService).run.update({
      where: { id: old.id },
      data: { started_at: new Date(Date.now() - (lease_seconds + 1) * 1_000) },
    });

    await app.get(AgentWakeService).handle({ owner_id: owner.owner_id, agent_id: agent.id });

    expect((await runs.find(owner.owner_id, young.id))?.status).toBe('running');
    expect(await runs.find(owner.owner_id, old.id)).toMatchObject({
      status: 'cancelled',
      error: 'Run never became active',
    });
  });
});
