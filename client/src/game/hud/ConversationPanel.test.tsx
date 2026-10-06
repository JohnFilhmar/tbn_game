import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { livePositions, OWNER_KEY } from '@/game/world/livePositions';
import { useWorldStore } from '@/game/world/worldStore';
import { fakeApi } from '@/testing/fakeApi';
import { openedSockets } from '@/testing/fakeSocket';
import {
  agentFixture,
  assistantEntry,
  chunkFixture,
  fixtureId,
  ownerMessage,
  taskFixture,
} from '@/testing/fixtures';
import { renderApp } from '@/testing/renderApp';

const ADA = agentFixture({ name: 'Ada' });

afterEach(() => {
  livePositions.clear();
  useWorldStore.setState({
    activities: {},
    narration: [],
    talkingTo: null,
    teleport: null,
    acknowledgement: null,
  });
});

describe('talking to an agent in the world', () => {
  it("lays out an agent's reply to a guest as Markdown", async () => {
    const at = '2026-10-07T00:00:00.000Z';
    const api = fakeApi({
      'GET /auth/me': () => ({
        kind: 'guest',
        id: fixtureId(),
        name: 'Mika',
        owner_username: 'john',
      }),
      'GET /player_messages': () => [],
      'GET /agents': () => [ADA],
      'GET /departments': () => [],
      'GET /tasks': () => [],
      'GET /runs': () => [],
      [`GET /agents/${ADA.id}/guest_chat`]: () => [
        {
          id: fixtureId(),
          guest_id: fixtureId(),
          agent_id: ADA.id,
          role: 'agent',
          text: 'Two things:\n\n- **Coffee** is fine\n- Water too',
          is_error: false,
          created_at: at,
        },
      ],
    });
    renderApp({ api, path: '/', isSignedIn: false });
    await screen.findByRole('button', { name: 'Desk' });
    act(() => {
      livePositions.set(OWNER_KEY, new Vector3(0, 0, 0));
      livePositions.set(ADA.id, new Vector3(0, 0, 1.5));
      useWorldStore.getState().setActivity(ADA.id, 'at_desk');
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Talk to Ada' }));
    const chat = await screen.findByRole('list', { name: 'Chat with Ada' });
    const coffee = await within(chat).findByText('Coffee');
    expect(coffee.tagName).toBe('STRONG');
    expect(coffee.closest('li')?.textContent).toBe('Coffee is fine');
    expect(chat.textContent).not.toContain('**');
  });

  it('opens its session beside the world, sends a message, shows the reply and closes', async () => {
    const api = fakeApi({
      'GET /agents': () => [ADA],
      'GET /departments': () => [],
      'GET /tasks': () => [],
      'GET /runs': () => [],
      [`GET /agents/${ADA.id}/transcript`]: () => [assistantEntry(ADA.id, 1, 'Morning, boss.')],
      [`POST /agents/${ADA.id}/messages`]: () => ownerMessage(ADA.id, 2, 'How is it going?'),
    });
    renderApp({ api, path: '/' });
    await screen.findByRole('button', { name: 'Desk' });
    act(() => {
      livePositions.set(OWNER_KEY, new Vector3(0, 0, 0));
      livePositions.set(ADA.id, new Vector3(0, 0, 1.5));
      useWorldStore.getState().setActivity(ADA.id, 'at_desk');
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Talk to Ada' }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(
      'BODY',
      document.body.textContent?.slice(0, 600),
      useWorldStore.getState().talkingTo,
    );
    const panel = await screen.findByRole('complementary', { name: 'Conversation with Ada' });
    expect(useWorldStore.getState().talkingTo).toBe(ADA.id);
    expect(await within(panel).findByText('Morning, boss.')).toBeDefined();
    const box = screen.getByLabelText('Message to Ada');
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(screen.queryByRole('region', { name: 'What is happening' })).toBeNull();

    await userEvent.type(box, 'How is it going?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(api.calls.find((call) => call.path === `/agents/${ADA.id}/messages`)?.body).toEqual({
        text: 'How is it going?',
      }),
    );

    act(() => {
      openedSockets.at(-1)?.serverSends(
        'stream',
        chunkFixture({
          agent_id: ADA.id,
          run_id: fixtureId(),
          call_id: fixtureId(),
          text: 'Going well',
        }),
      );
    });
    await waitFor(() => expect(panel.textContent).toContain('Going well'));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(useWorldStore.getState().talkingTo).toBeNull());
    expect(screen.queryByRole('complementary', { name: 'Conversation with Ada' })).toBeNull();
    expect(screen.getByRole('region', { name: 'What is happening' })).toBeDefined();
  });

  it('gives a task with /task, which the agent takes with a line and a gesture', async () => {
    const task = taskFixture({ title: 'Write a haiku', assignee_agent_id: ADA.id });
    const api = fakeApi({
      'GET /agents': () => [ADA],
      'GET /departments': () => [],
      'GET /tasks': () => [],
      'GET /runs': () => [],
      [`GET /agents/${ADA.id}/transcript`]: () => [],
      'POST /tasks': () => task,
    });
    renderApp({ api, path: '/' });
    await screen.findByRole('button', { name: 'Desk' });
    act(() => {
      livePositions.set(OWNER_KEY, new Vector3(0, 0, 0));
      livePositions.set(ADA.id, new Vector3(0, 0, 1.5));
      useWorldStore.getState().setActivity(ADA.id, 'at_desk');
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Talk to Ada' }));
    const box = await screen.findByLabelText('Message to Ada');

    await userEvent.type(box, '/help');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/\/task <what to do> gives this agent a task/)).toBeDefined();

    await userEvent.type(box, '/task Write a haiku');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(
        api.calls.find((call) => call.method === 'POST' && call.path === '/tasks')?.body,
      ).toEqual({
        title: 'Write a haiku',
        instructions: 'Write a haiku',
        assignee_agent_id: ADA.id,
      }),
    );
    expect(api.calls.some((call) => call.path === `/agents/${ADA.id}/messages`)).toBe(false);
    const taken = useWorldStore.getState().acknowledgement;
    expect(taken?.agentId).toBe(ADA.id);
    expect(useWorldStore.getState().narration.at(-1)?.text).toBe(`Ada: "${taken?.line}"`);
  });
});
