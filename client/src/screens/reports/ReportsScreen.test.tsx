import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Report, Task } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/apiError';
import { fakeApi } from '@/testing/fakeApi';
import { agentFixture, fixtureId, taskFixture } from '@/testing/fixtures';
import { renderApp } from '@/testing/renderApp';

const AT = '2026-10-02T12:00:00.000Z';

function reportOf(task: Task, agentId: string, body: string): Report {
  return { id: fixtureId(), task_id: task.id, agent_id: agentId, body_md: body, created_at: AT };
}

describe('the reports screen', () => {
  it('shows its loading state until the reports arrive', async () => {
    const api = fakeApi({
      'GET /reports': () => new Promise(() => undefined),
      'GET /tasks': () => [],
      'GET /agents': () => [],
    });
    renderApp({ api, path: '/reports' });
    const loading = await screen.findByText(/Loading reports/);
    expect(loading.getAttribute('role')).toBe('status');
  });

  it('says what fills it when there is nothing yet', async () => {
    renderApp({
      api: fakeApi({ 'GET /reports': () => [], 'GET /tasks': () => [], 'GET /agents': () => [] }),
      path: '/reports',
    });
    expect(await screen.findByRole('heading', { name: 'No reports yet' })).toBeDefined();
  });

  it('shows why loading failed and loads again on request', async () => {
    let attempts = 0;
    const api = fakeApi({
      'GET /reports': () => {
        attempts += 1;
        if (attempts === 1) throw new ApiError(503, 'The database is not reachable');
        return [];
      },
      'GET /tasks': () => [],
      'GET /agents': () => [],
    });
    renderApp({ api, path: '/reports' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The reports could not be loaded');
    expect(alert.textContent).toContain('The database is not reachable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'No reports yet' })).toBeDefined();
  });

  it('lists reports newest first and opens one rendered from Markdown', async () => {
    const agent = agentFixture({ name: 'ada' });
    const older = taskFixture({ title: 'Older task', assignee_agent_id: agent.id });
    const newer = taskFixture({ title: 'Newer task', assignee_agent_id: agent.id });
    const first = reportOf(older, agent.id, '# Old');
    const second = {
      ...reportOf(newer, agent.id, '## Findings\n\n- **Three** sources'),
      created_at: '2026-10-02T13:00:00.000Z',
    };
    renderApp({
      api: fakeApi({
        'GET /reports': () => [first, second],
        'GET /tasks': () => [older, newer],
        'GET /agents': () => [agent],
      }),
      path: '/reports',
    });
    const links = await screen.findAllByRole('link', { name: /task$/ });
    expect(links.map((link) => link.textContent)).toEqual(['Newer task', 'Older task']);
    const [newest] = links;
    if (newest === undefined) throw new Error('No report link');
    await userEvent.click(newest);
    const report = await screen.findByRole('article', { name: 'Report' });
    await waitFor(() => expect(report.querySelector('h3')?.textContent).toBe('Findings'));
    expect(report.querySelector('strong')?.textContent).toBe('Three');
  });
});
