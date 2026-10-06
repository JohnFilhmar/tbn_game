import type { ChangeEvent } from '@tbn/contracts';
import { is_visible } from './event_visibility';

const OWNER = { id: '00000000-0000-4000-8000-000000000001', kind: 'owner' as const };
const MIKA = { id: '00000000-0000-4000-8000-000000000002', kind: 'guest' as const };
const BO = { id: '00000000-0000-4000-8000-000000000003', kind: 'guest' as const };
const AT = '2026-10-06T00:00:00.000Z';

function message(from_id: string, to_id: string): ChangeEvent {
  return {
    seq: 1,
    entity: 'player_message',
    id: '00000000-0000-4000-8000-0000000000aa',
    op: 'insert',
    changed: null,
    at: AT,
    data: {
      id: '00000000-0000-4000-8000-0000000000aa',
      from_id,
      from_name: 'x',
      to_id,
      text: 'hi',
      read_at: null,
      created_at: AT,
    },
  };
}

function chat(guest_id: string): ChangeEvent {
  return {
    seq: 2,
    entity: 'guest_chat_message',
    id: '00000000-0000-4000-8000-0000000000bb',
    op: 'insert',
    changed: null,
    at: AT,
    data: {
      id: '00000000-0000-4000-8000-0000000000bb',
      guest_id,
      agent_id: '00000000-0000-4000-8000-0000000000cc',
      role: 'guest',
      text: 'hello',
      is_error: false,
      created_at: AT,
    },
  };
}

describe('which changes a socket sees', () => {
  it('delivers a player message to its two players only, the owner included', () => {
    expect(is_visible(message(MIKA.id, BO.id), MIKA)).toBe(true);
    expect(is_visible(message(MIKA.id, BO.id), BO)).toBe(true);
    expect(is_visible(message(MIKA.id, BO.id), OWNER)).toBe(false);
    expect(is_visible(message(OWNER.id, MIKA.id), OWNER)).toBe(true);
  });

  it("shows a guest's chat to that guest and the owner", () => {
    expect(is_visible(chat(MIKA.id), MIKA)).toBe(true);
    expect(is_visible(chat(MIKA.id), BO)).toBe(false);
    expect(is_visible(chat(MIKA.id), OWNER)).toBe(true);
  });

  it('keeps provider spend and connection settings from guests', () => {
    const cap_windows: ChangeEvent = {
      seq: 3,
      entity: 'cap_windows',
      id: '00000000-0000-4000-8000-0000000000dd',
      op: 'update',
      changed: null,
      at: AT,
      data: [],
    };
    expect(is_visible(cap_windows, MIKA)).toBe(false);
    expect(is_visible(cap_windows, OWNER)).toBe(true);
    const preferences: ChangeEvent = { ...cap_windows, entity: 'preferences', data: null };
    expect(is_visible(preferences, MIKA)).toBe(true);
  });
});
