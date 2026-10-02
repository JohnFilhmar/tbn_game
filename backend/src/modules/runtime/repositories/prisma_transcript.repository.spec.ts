import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { create_test_web_app, load_test_config } from '@/testing/test_app';
import { create_test_provider, recruit_test_agent } from '@/testing/test_company';
import { create_test_owner, type TestOwner } from '@/testing/test_owner';
import {
  TRANSCRIPT_REPOSITORY,
  type TranscriptRepository,
} from './interface/transcript_repository.interface';

describe('PrismaTranscriptRepository messages and results', () => {
  let app: NestExpressApplication;
  let owner: TestOwner;
  let other: TestOwner;
  let transcripts: TranscriptRepository;
  let provider_id: string;

  beforeAll(async () => {
    app = await create_test_web_app(load_test_config());
    owner = await create_test_owner(app);
    other = await create_test_owner(app);
    transcripts = app.get<TranscriptRepository>(TRANSCRIPT_REPOSITORY);
    provider_id = (await create_test_provider(app, owner.owner_id, 'anthropic_messages')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function new_agent(): Promise<string> {
    return (await recruit_test_agent(app, owner.owner_id, provider_id)).id;
  }

  it('stores an entry with a dedupe key once and returns the stored one on a repeat', async () => {
    const agent_id = await new_agent();
    const result = {
      kind: 'subtask_result',
      content: {
        task_id: randomUUID(),
        title: 'Research',
        assignee_agent_id: randomUUID(),
        assignee_name: 'Research intern 1',
        status: 'done',
        result: 'Found it.',
        report_id: null,
        report_md: null,
      },
    } as const;
    const first = await transcripts.append(owner.owner_id, agent_id, null, result, 'result:1');
    const again = await transcripts.append(owner.owner_id, agent_id, null, result, 'result:1');
    expect(again.id).toBe(first.id);
    const other_key = await transcripts.append(owner.owner_id, agent_id, null, result, 'result:2');
    const plain = await transcripts.append(owner.owner_id, agent_id, null, {
      kind: 'system_note',
      content: { text: 'Note.' },
    });
    expect([first.seq, other_key.seq, plain.seq]).toEqual([1, 2, 3]);
    expect(await transcripts.list_all(owner.owner_id, agent_id)).toHaveLength(3);
  });

  it('reports an owner message, an agent message or a subtask result after the last answer as unread', async () => {
    const agent_id = await new_agent();
    expect(await transcripts.has_unread(owner.owner_id, agent_id)).toBe(false);
    await transcripts.append(owner.owner_id, agent_id, null, {
      kind: 'system_note',
      content: { text: 'Not a message.' },
    });
    expect(await transcripts.has_unread(owner.owner_id, agent_id)).toBe(false);

    await transcripts.append(owner.owner_id, agent_id, null, {
      kind: 'owner_message',
      content: { text: 'Hello.' },
    });
    expect(await transcripts.has_unread(owner.owner_id, agent_id)).toBe(true);
    expect(await transcripts.has_unread(other.owner_id, agent_id)).toBe(false);

    await transcripts.append(owner.owner_id, agent_id, null, {
      kind: 'assistant',
      content: { blocks: [{ type: 'text', text: 'Hi.' }] },
    });
    expect(await transcripts.has_unread(owner.owner_id, agent_id)).toBe(false);

    await transcripts.append(owner.owner_id, agent_id, null, {
      kind: 'agent_message',
      content: { from_agent_id: agent_id, from_name: 'Peer', kind: 'question', text: 'Why?' },
    });
    expect(await transcripts.has_unread(owner.owner_id, agent_id)).toBe(true);
  });
});
