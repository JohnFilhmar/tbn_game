import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  DEPARTMENT_REPOSITORY,
  type DepartmentRepository,
} from './interface/department_repository.interface';

describe('the department repository', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let departments: DepartmentRepository;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    departments = app.get<DepartmentRepository>(DEPARTMENT_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('renames a department of its owner only', async () => {
    const provider = await create_test_provider(app, owner.owner_id, 'anthropic_messages');
    const agent = await recruit_test_agent(app, owner.owner_id, provider.id);
    const renamed = await departments.rename(owner.owner_id, agent.department_id, 'Field work');
    expect(renamed).toMatchObject({ id: agent.department_id, name: 'Field work', member_count: 1 });

    const other = await create_test_owner(app);
    expect(await departments.rename(other.owner_id, agent.department_id, 'Taken')).toBeNull();
    expect(await departments.rename(owner.owner_id, randomUUID(), 'Nowhere')).toBeNull();
    expect((await departments.find(owner.owner_id, agent.department_id))?.name).toBe('Field work');
  });
});
