import { describe, expect, it } from 'vitest';
import { isThirsty, propStatesOf, stateOf } from './propStates';

const PLANT = '00000000-0000-4000-8000-000000000101';
const RADIO = '00000000-0000-4000-8000-000000000102';
const NOW = Date.parse('2026-10-10T12:00:00.000Z');

describe('the prop states', () => {
  it('droop a plant before its first watering and three days after its last', () => {
    expect(isThirsty(null, NOW)).toBe(true);
    expect(isThirsty('2026-10-08T12:00:00.000Z', NOW)).toBe(false);
    expect(isThirsty('2026-10-07T12:00:01.000Z', NOW)).toBe(false);
    expect(isThirsty('2026-10-07T11:59:59.000Z', NOW)).toBe(true);
  });

  it('read a plant and a radio from their rows, and their first states without one', () => {
    const states = propStatesOf([
      {
        id: PLANT,
        environment: 'office',
        placement_id: PLANT,
        kind: 'tree',
        state: { watered_at: '2026-10-09T08:00:00.000Z' },
        updated_at: '2026-10-09T08:00:00.000Z',
      },
      {
        id: RADIO,
        environment: 'office',
        placement_id: RADIO,
        kind: 'radio',
        state: { on: true },
        updated_at: '2026-10-09T08:00:00.000Z',
      },
    ]);
    expect(stateOf.wateredAt(states, PLANT)).toBe('2026-10-09T08:00:00.000Z');
    expect(stateOf.isRadioOn(states, RADIO)).toBe(true);
    expect(stateOf.wateredAt(states, RADIO)).toBeNull();
    expect(stateOf.isRadioOn(new Map(), RADIO)).toBe(false);
  });
});
