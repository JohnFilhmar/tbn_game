import { QueryClient } from '@tanstack/react-query';
import type { Agent, TranscriptEntry } from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, queryKeys } from '@/lib/data/collections';
import {
  agentChange,
  agentFixture,
  assistantEntry,
  capWindowsChange,
  entryChange,
  ownerMessage,
  preferencesChange,
  preferencesFixture,
} from '@/testing/fixtures';
import { applyChange, applyChanges } from './applyChanges';

const AGENTS = COLLECTIONS.agents.key;

describe('applying change events to the cache', () => {
  it('replaces, adds and removes rows of a loaded collection in place', () => {
    const client = new QueryClient();
    const ada = agentFixture({ name: 'ada' });
    const bo = agentFixture({ name: 'bo' });
    client.setQueryData<Agent[]>(AGENTS, [ada]);

    applyChanges(client, [
      agentChange(ada.id, 'update', { ...ada, status: 'working' }, 1),
      agentChange(bo.id, 'insert', bo, 2),
    ]);
    expect(
      client.getQueryData<Agent[]>(AGENTS)?.map((agent) => [agent.name, agent.status]),
    ).toEqual([
      ['ada', 'working'],
      ['bo', 'idle'],
    ]);

    applyChange(client, agentChange(ada.id, 'delete', null, 3));
    expect(client.getQueryData<Agent[]>(AGENTS)?.map((agent) => agent.name)).toEqual(['bo']);
  });

  it('leaves a collection nobody loaded for its first fetch', () => {
    const client = new QueryClient();
    const ada = agentFixture();
    applyChange(client, agentChange(ada.id, 'insert', ada));
    expect(client.getQueryData(AGENTS)).toBeUndefined();
  });

  it("keeps an agent's transcript in seq order, whatever order entries arrive in", () => {
    const client = new QueryClient();
    const agent = agentFixture();
    const key = queryKeys.transcript(agent.id);
    const first = ownerMessage(agent.id, 1, 'Hello');
    client.setQueryData<TranscriptEntry[]>(key, [first]);
    applyChanges(client, [
      entryChange(assistantEntry(agent.id, 3, 'Third')),
      entryChange(assistantEntry(agent.id, 2, 'Second')),
    ]);
    expect(client.getQueryData<TranscriptEntry[]>(key)?.map((entry) => entry.seq)).toEqual([
      1, 2, 3,
    ]);
    const elsewhere = queryKeys.transcript(agentFixture().id);
    expect(client.getQueryData(elsewhere)).toBeUndefined();
  });

  it("replaces a provider's cap windows and the preferences whole", () => {
    const client = new QueryClient();
    applyChange(client, capWindowsChange('provider-1', []));
    expect(client.getQueryData(queryKeys.capWindows('provider-1'))).toEqual([]);
    const dark = preferencesFixture({ theme: 'dark' });
    applyChange(client, preferencesChange('owner-1', dark));
    expect(client.getQueryData(queryKeys.preferences())).toEqual(dark);
  });
});
