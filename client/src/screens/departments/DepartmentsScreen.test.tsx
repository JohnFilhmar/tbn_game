import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateDepartmentSchema, type Department } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '@/testing/fakeApi';
import { agentFixture, fixtureId } from '@/testing/fixtures';
import { renderApp } from '@/testing/renderApp';

const AT = '2026-10-02T12:00:00.000Z';

describe('the departments screen', () => {
  it('renames a department from its row', async () => {
    const manager = agentFixture({ name: 'ada' });
    const department: Department = {
      id: manager.department_id,
      name: 'Researcher',
      manager_agent_id: manager.id,
      member_count: 1,
      created_at: AT,
      updated_at: AT,
    };
    const api = fakeApi({
      'GET /departments': () => [department],
      'GET /agents': () => [manager],
      [`PATCH /departments/${department.id}`]: (body) => ({
        ...department,
        name: UpdateDepartmentSchema.parse(body).name,
      }),
    });
    renderApp({ api, path: '/departments' });
    const table = await screen.findByRole('table', { name: 'Departments' });
    await userEvent.click(within(table).getByRole('button', { name: 'Rename Researcher' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename Researcher' });
    const field = within(dialog).getByLabelText('Name');
    await userEvent.clear(field);
    await userEvent.type(field, 'Field research');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(await within(table).findByText('Field research')).toBeDefined();
    expect(api.calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      name: 'Field research',
    });
  });

  it('pages a long list of departments 25 at a time', async () => {
    const departments: Department[] = Array.from({ length: 30 }, (_, index) => ({
      id: fixtureId(),
      name: `Team ${String(index + 1).padStart(2, '0')}`,
      manager_agent_id: null,
      member_count: 0,
      created_at: AT,
      updated_at: AT,
    }));
    renderApp({
      api: fakeApi({ 'GET /departments': () => departments, 'GET /agents': () => [] }),
      path: '/departments',
    });
    const table = await screen.findByRole('table', { name: 'Departments' });
    expect(within(table).getByText('Team 25')).toBeDefined();
    expect(within(table).queryByText('Team 26')).toBeNull();
    const pages = screen.getByRole('navigation', { name: 'Departments pages' });
    expect(pages.textContent).toContain('1 to 25 of 30');
    await userEvent.click(within(pages).getByRole('button', { name: 'Next' }));
    expect(within(table).getByText('Team 30')).toBeDefined();
    expect(pages.textContent).toContain('26 to 30 of 30');

    const search = screen.getByRole('searchbox', { name: 'Search departments' });
    await userEvent.type(search, '21 team');
    expect(within(table).getByText('Team 21')).toBeDefined();
    expect(within(table).queryByText('Team 01')).toBeNull();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await userEvent.clear(search);
    await userEvent.type(search, 'sales');
    expect(within(table).getByText('Nothing matches "sales".')).toBeDefined();
  });
});
