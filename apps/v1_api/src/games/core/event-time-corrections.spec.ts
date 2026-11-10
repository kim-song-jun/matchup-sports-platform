import {
  applyEventTimesToRevisionSnapshot,
  eventClockUpperBoundMs,
  foldEventTimeCorrections,
  latestEventTimeCorrections,
  overlayEventTimeCorrections,
  revisionMinuteFromClock,
  sortEventsByMatchTime,
} from './event-time-corrections';

const card = { id: 'card-1', type: 'CARD', period: 1, clockMs: 11 * 60_000, sequence: 1, correctsEventId: null };
const goal = { id: 'goal-1', type: 'GOAL', period: 1, clockMs: 5 * 60_000, sequence: 2, correctsEventId: null };
const correction = (id: string, target: string, clockMs: number, sequence: number) => ({
  id, type: 'TIME_CORRECTION', period: 1, clockMs, sequence, correctsEventId: target,
});

describe('event time corrections (MD-QA #187)', () => {
  it('applies only the latest correction per event, by sequence rather than array order', () => {
    const events = [card, goal, correction('c-2', 'card-1', 3 * 60_000, 5), correction('c-1', 'card-1', 9 * 60_000, 3)];
    expect(latestEventTimeCorrections(events).get('card-1')).toBe(3 * 60_000);
  });

  it('fold replaces the original clock and drops correction rows without touching type, side or count', () => {
    const folded = foldEventTimeCorrections([card, goal, correction('c-1', 'card-1', 9 * 60_000, 3)]);
    expect(folded).toHaveLength(2);
    expect(folded.find((event) => event.id === 'card-1')).toMatchObject({ type: 'CARD', clockMs: 9 * 60_000 });
    expect(folded.find((event) => event.id === 'goal-1')).toBe(goal);
    expect(folded.some((event) => event.type === 'TIME_CORRECTION')).toBe(false);
  });

  it('overlay keeps correction rows so the console sequence stays contiguous', () => {
    const overlaid = overlayEventTimeCorrections([card, goal, correction('c-1', 'card-1', 9 * 60_000, 3)]);
    expect(overlaid.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(overlaid[0].clockMs).toBe(9 * 60_000);
    expect(overlaid[2]).toMatchObject({ type: 'TIME_CORRECTION', clockMs: 9 * 60_000 });
  });

  it('leaves events without corrections untouched (same reference)', () => {
    expect(foldEventTimeCorrections([card])[0]).toBe(card);
  });

  it('re-sorts by period, corrected clock, then sequence', () => {
    const folded = foldEventTimeCorrections([goal, card, correction('c-1', 'card-1', 3 * 60_000, 3)]);
    expect(sortEventsByMatchTime(folded).map((event) => event.id)).toEqual(['card-1', 'goal-1']);
  });

  describe('eventClockUpperBoundMs', () => {
    const now = new Date('2026-11-10T10:00:00.000Z');
    it('uses the configured period length when the period ran shorter', () => {
      expect(eventClockUpperBoundMs({
        configuredMinutes: 45,
        period: { startedAt: new Date('2026-11-10T09:00:00.000Z'), endedAt: new Date('2026-11-10T09:30:00.000Z'), pausedTotalMs: 0, pausedAt: null },
        now,
      })).toBe(45 * 60_000);
    });

    it('allows stoppage time: the actually played length minus pauses wins when longer', () => {
      expect(eventClockUpperBoundMs({
        configuredMinutes: 45,
        period: { startedAt: new Date('2026-11-10T09:00:00.000Z'), endedAt: new Date('2026-11-10T09:50:00.000Z'), pausedTotalMs: 2 * 60_000, pausedAt: null },
        now,
      })).toBe(48 * 60_000);
    });

    it('excludes a still-open pause on a live period', () => {
      expect(eventClockUpperBoundMs({
        configuredMinutes: null,
        period: { startedAt: new Date('2026-11-10T09:00:00.000Z'), endedAt: null, pausedTotalMs: 0, pausedAt: new Date('2026-11-10T09:50:00.000Z') },
        now,
      })).toBe(50 * 60_000);
    });

    it('returns null when neither the configuration nor the period timing is known', () => {
      expect(eventClockUpperBoundMs({ configuredMinutes: null, period: null, now })).toBeNull();
    });
  });

  describe('applyEventTimesToRevisionSnapshot', () => {
    const goalEvents = [
      { id: 'goal-1', sideId: 'home', participantId: 'p1', minute: 5, period: 1, ownGoal: false },
      { id: 'goal-2', sideId: 'away', participantId: 'p2', minute: 30, period: 1, ownGoal: false },
    ];

    it('returns null when no snapshot minute changes', () => {
      expect(applyEventTimesToRevisionSnapshot({
        goalEvents,
        participants: [{ id: 'row-1', cards: { yellow: 1, red: 0 } }],
        clockByEventId: new Map([['goal-1', 4 * 60_000 + 1]]),
      })).toBeNull();
    });

    it('rewrites only the corrected goal minute and the explicit card event minute', () => {
      const result = applyEventTimesToRevisionSnapshot({
        goalEvents,
        participants: [
          { id: 'row-1', cards: { yellow: 1, red: 0, events: [{ id: 'card-1', card: 'YELLOW', minute: 11, period: 1 }] } },
          { id: 'row-2', cards: { yellow: 0, red: 0 } },
        ],
        clockByEventId: new Map([['goal-1', 2 * 60_000], ['card-1', 9 * 60_000]]),
      });
      expect(result).not.toBeNull();
      expect(result!.goalEvents).toEqual([
        { ...goalEvents[0], minute: 2 },
        goalEvents[1],
      ]);
      expect(result!.participantCards.get('row-1')).toEqual({
        yellow: 1, red: 0, events: [{ id: 'card-1', card: 'YELLOW', minute: 9, period: 1 }],
      });
      expect(result!.participantCards.has('row-2')).toBe(false);
    });

    it('uses the same minute rounding as the result derivation', () => {
      expect(revisionMinuteFromClock(0)).toBe(0);
      expect(revisionMinuteFromClock(60_000)).toBe(1);
      expect(revisionMinuteFromClock(60_001)).toBe(2);
    });
  });
});
