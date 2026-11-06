import { resolveResultCardEvents } from './result-card-events';

const participant = { participantId: 'p1', sideId: 'home', cards: { yellow: 2, red: 1 } };
const live = { id: 'yellow', type: 'CARD', participantId: 'p1', sideId: 'home',
  payload: { card: 'YELLOW' }, period: 2, clockMs: 600000, reversesEventId: null };

describe('official result card events', () => {
  it('retains live time and fills aggregate-only cards without inventing time', () => {
    const rows = resolveResultCardEvents([participant], [live]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: 'yellow', card: 'YELLOW', minute: 10, period: 2 });
    expect(rows[1].minute).toBeUndefined();
    expect(rows[2]).toMatchObject({ card: 'RED', participantId: 'p1' });
  });
  it('excludes cancelled live cards', () => {
    const rows = resolveResultCardEvents([participant], [live, { ...live, id: 'undo', type: 'CORRECTION', reversesEventId: 'yellow' }]);
    expect(rows.every((row) => row.minute === undefined)).toBe(true);
  });
  it('uses corrected color/time and never resurrects a deleted live card', () => {
    expect(resolveResultCardEvents([{ ...participant, cards: { yellow: 0, red: 1,
      events: [{ id: 'new', card: 'RED', minute: 5, period: 1 }] } }], [live]))
      .toEqual([{ id: 'new', card: 'RED', minute: 5, period: 1, participantId: 'p1', sideId: 'home' }]);
    expect(resolveResultCardEvents([{ ...participant, cards: { yellow: 0, red: 0, events: [] } }], [live])).toEqual([]);
  });
});
