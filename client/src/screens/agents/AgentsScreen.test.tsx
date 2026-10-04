import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Department } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '@/testing/fakeApi';
import { agentFixture } from '@/testing/fixtures';
import { renderApp } from '@/testing/renderApp';

const AT = '2026-10-02T12:00:00.000Z';

describe('the agents screen', () => {
  it('shows former agents only under their filter, and rehires one', async () => {
    const live = agentFixture({ name: 'ada' });
    const former = agentFixture({
      name: 'bo',
      status: 'dismissed',
      department_id: live.department_id,
    });
    const department: Department = {
      id: live.department_id,
      name: 'Researcher',
      manager_agent_id: live.id,
      member_count: 1,
      created_at: AT,
      updated_at: AT,
    };
    const api = fakeApi({
      'GET /agents': () => [live, former],
      'GET /departments': () => [department],
      'GET /tasks': () => [],
      [`POST /agents/${former.id}/rehire`]: () => ({ ...former, status: 'idle' }),
    });
    renderApp({ api, path: '/agents' });
    const table = await screen.findByRole('table', { name: 'Agents' });
    expect(within(table).getByText('ada')).toBeDefined();
    expect(within(table).queryByText('bo')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Dismissed or ended/ }));
    const formerTable = screen.getByRole('table', { name: 'Agents' });
    await userEvent.click(within(formerTable).getByRole('button', { name: 'Rehire bo' }));
    expect(api.calls.some((call) => call.path === `/agents/${former.id}/rehire`)).toBe(true);
    expect(await screen.findByRole('heading', { name: 'No agent matches' })).toBeDefined();
  });
});
