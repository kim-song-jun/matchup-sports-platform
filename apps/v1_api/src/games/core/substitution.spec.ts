import {
  countActiveSubstitutions,
  deriveAppearedParticipantIds,
  deriveOnPitchParticipantIds,
  validateSubstitution,
  type SubstitutionParticipant,
  type SubstitutionPriorEvent,
} from './substitution';

function participant(
  id: string,
  sideId: string,
  started: boolean,
  placement: { position?: string | null; positionX?: number | null; positionY?: number | null } = {},
): SubstitutionParticipant {
  return {
    id,
    sideId,
    started,
    position: placement.position ?? null,
    positionX: placement.positionX ?? null,
    positionY: placement.positionY ?? null,
  };
}

function subEvent(
  id: string,
  sequence: number,
  sideId: string,
  inParticipantId: string,
  outParticipantId: string,
  reversesEventId: string | null = null,
): SubstitutionPriorEvent {
  return {
    id,
    sequence,
    type: 'SUBSTITUTION',
    sideId,
    participantId: inParticipantId,
    reversesEventId,
    payload: { outParticipantId },
  };
}

describe('deriveOnPitchParticipantIds', () => {
  it('starts from `started` participants when there are no events yet', () => {
    const participants = [
      participant('p1', 'side-home', true),
      participant('p2', 'side-home', false),
    ];
    expect(deriveOnPitchParticipantIds(participants, [])).toEqual(new Set(['p1']));
  });

  it('folds a substitution: outgoing leaves, incoming joins', () => {
    const participants = [
      participant('p1', 'side-home', true),
      participant('p2', 'side-home', false),
    ];
    const onPitch = deriveOnPitchParticipantIds(participants, [subEvent('e1', 1, 'side-home', 'p2', 'p1')]);
    expect(onPitch.has('p1')).toBe(false);
    expect(onPitch.has('p2')).toBe(true);
  });

  it('applies events in sequence order, not array order — rolling subs can send a player back on', () => {
    const participants = [
      participant('p1', 'side-home', true),
      participant('p2', 'side-home', false),
    ];
    // Chronologically: p1 out/p2 in (seq 1), then p2 out/p1 in (seq 2) — net
    // result is p1 back on, p2 back off. Passed in REVERSE array order to
    // prove the fold sorts by `sequence` itself rather than trusting the
    // caller's array order.
    const events = [subEvent('e2', 2, 'side-home', 'p1', 'p2'), subEvent('e1', 1, 'side-home', 'p2', 'p1')];
    const onPitch = deriveOnPitchParticipantIds(participants, events);
    expect(onPitch.has('p1')).toBe(true);
    expect(onPitch.has('p2')).toBe(false);
  });

  it('ignores a reversed SUBSTITUTION event entirely — reversal restores prior on-pitch state with no special-casing', () => {
    const participants = [
      participant('p1', 'side-home', true),
      participant('p2', 'side-home', false),
    ];
    const events: SubstitutionPriorEvent[] = [
      subEvent('e1', 1, 'side-home', 'p2', 'p1'),
      {
        id: 'e2',
        sequence: 2,
        type: 'CORRECTION',
        sideId: 'side-home',
        participantId: 'p1',
        reversesEventId: 'e1',
        payload: { reason: 'misclick' },
      },
    ];
    const onPitch = deriveOnPitchParticipantIds(participants, events);
    expect(onPitch.has('p1')).toBe(true);
    expect(onPitch.has('p2')).toBe(false);
  });

  it('ignores non-SUBSTITUTION events', () => {
    const participants = [participant('p1', 'side-home', true)];
    const events: SubstitutionPriorEvent[] = [
      { id: 'e1', sequence: 1, type: 'GOAL', sideId: 'side-home', participantId: 'p1', reversesEventId: null, payload: {} },
    ];
    expect(deriveOnPitchParticipantIds(participants, events)).toEqual(new Set(['p1']));
  });
});

describe('deriveAppearedParticipantIds', () => {
  it('counts starters and excludes a bench player who never came on', () => {
    const participants = [
      participant('starter', 'side-home', true),
      participant('unused-bench', 'side-home', false),
    ];
    expect(deriveAppearedParticipantIds(participants, [])).toEqual(new Set(['starter']));
  });

  it('counts a substitute who came on', () => {
    const participants = [
      participant('starter', 'side-home', true),
      participant('sub', 'side-home', false),
    ];
    const appeared = deriveAppearedParticipantIds(participants, [
      subEvent('e1', 1, 'side-home', 'sub', 'starter'),
    ]);
    expect(appeared).toEqual(new Set(['starter', 'sub']));
  });

  it('keeps a substituted-off starter — going off does not un-play the match', () => {
    // The contrast with deriveOnPitchParticipantIds is the whole point: there
    // the starter is removed, here they stay.
    const participants = [
      participant('starter', 'side-home', true),
      participant('sub', 'side-home', false),
    ];
    const events = [subEvent('e1', 1, 'side-home', 'sub', 'starter')];
    expect(deriveOnPitchParticipantIds(participants, events).has('starter')).toBe(false);
    expect(deriveAppearedParticipantIds(participants, events).has('starter')).toBe(true);
  });

  it('does not count a substitute whose substitution was reversed', () => {
    const participants = [
      participant('starter', 'side-home', true),
      participant('sub', 'side-home', false),
    ];
    const appeared = deriveAppearedParticipantIds(participants, [
      subEvent('e1', 1, 'side-home', 'sub', 'starter'),
      subEvent('e2', 2, 'side-home', 'starter', 'sub', 'e1'),
    ]);
    expect(appeared).toEqual(new Set(['starter']));
  });

  it('counts a rolling substitute who came on, went off, and came on again', () => {
    const participants = [
      participant('starter', 'side-home', true),
      participant('sub', 'side-home', false),
    ];
    const appeared = deriveAppearedParticipantIds(participants, [
      subEvent('e1', 1, 'side-home', 'sub', 'starter'),
      subEvent('e2', 2, 'side-home', 'starter', 'sub'),
    ]);
    expect(appeared).toEqual(new Set(['starter', 'sub']));
  });

  it('ignores non-SUBSTITUTION events — a bench player named on a GOAL is not folded in here', () => {
    // The stat-map union that covers this case lives in
    // `GamesService#deriveTournamentRevision`, deliberately not in this pure
    // fold, which answers only "who was fielded".
    const participants = [
      participant('starter', 'side-home', true),
      participant('bench', 'side-home', false),
    ];
    const events: SubstitutionPriorEvent[] = [
      { id: 'e1', sequence: 1, type: 'GOAL', sideId: 'side-home', participantId: 'bench', reversesEventId: null, payload: {} },
    ];
    expect(deriveAppearedParticipantIds(participants, events)).toEqual(new Set(['starter']));
  });
});

describe('countActiveSubstitutions', () => {
  it('counts only non-reversed SUBSTITUTION events for the given side', () => {
    const events: SubstitutionPriorEvent[] = [
      subEvent('e1', 1, 'side-home', 'p2', 'p1'),
      subEvent('e2', 2, 'side-away', 'p4', 'p3'),
      subEvent('e3', 3, 'side-home', 'p5', 'p2', null),
      {
        id: 'e4',
        sequence: 4,
        type: 'CORRECTION',
        sideId: 'side-home',
        participantId: null,
        reversesEventId: 'e3',
        payload: {},
      },
    ];
    expect(countActiveSubstitutions('side-home', events)).toBe(1);
    expect(countActiveSubstitutions('side-away', events)).toBe(1);
  });
});

describe('validateSubstitution', () => {
  const participants: SubstitutionParticipant[] = [
    participant('out-1', 'side-home', true, { position: 'FW', positionX: 50, positionY: 80 }),
    participant('in-1', 'side-home', false),
    participant('away-1', 'side-away', true),
  ];

  it('accepts a valid substitution and returns the outgoing participant\'s pitch placement', () => {
    const result = validateSubstitution({
      sideId: 'side-home',
      inParticipantId: 'in-1',
      outParticipantId: 'out-1',
      participants,
      priorEvents: [],
      substitutionMode: 'rolling',
      maxSubstitutions: null,
    });
    expect(result).toEqual({ position: 'FW', positionX: 50, positionY: 80 });
  });

  it('rejects the same participant as both in and out', () => {
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'out-1',
        outParticipantId: 'out-1',
        participants,
        priorEvents: [],
        substitutionMode: 'rolling',
        maxSubstitutions: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'SUBSTITUTION_INVALID' }));
  });

  it('rejects an incoming participant from the other side', () => {
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'away-1',
        outParticipantId: 'out-1',
        participants,
        priorEvents: [],
        substitutionMode: 'rolling',
        maxSubstitutions: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'PARTICIPANT_SIDE_MISMATCH' }));
  });

  it('rejects an outgoing participant who is not currently on the pitch', () => {
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'out-1', // on pitch, so this would be "in" a player already on
        outParticipantId: 'in-1', // never started, not on pitch
        participants,
        priorEvents: [],
        substitutionMode: 'rolling',
        maxSubstitutions: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'SUBSTITUTION_OUT_NOT_ON_PITCH' }));
  });

  it('rejects an incoming participant who is already on the pitch', () => {
    const bothStarted: SubstitutionParticipant[] = [
      participant('out-1', 'side-home', true),
      participant('also-on-1', 'side-home', true),
    ];
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'also-on-1',
        outParticipantId: 'out-1',
        participants: bothStarted,
        priorEvents: [],
        substitutionMode: 'rolling',
        maxSubstitutions: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'SUBSTITUTION_IN_ALREADY_ON_PITCH' }));
  });

  it('enforces maxSubstitutions when limited', () => {
    const priorEvents = [subEvent('e1', 1, 'side-home', 'in-1', 'out-1')];
    // in-1 is now on the pitch after e1 — reuse it as the next "out" so this
    // test only has to prove the counter, not chain more participants.
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'out-1',
        outParticipantId: 'in-1',
        participants,
        priorEvents,
        substitutionMode: 'limited',
        maxSubstitutions: 1,
      }),
    ).toThrow(expect.objectContaining({ code: 'SUBSTITUTION_LIMIT_REACHED' }));
  });

  it('does not enforce a cap when substitutionMode is rolling, even if maxSubstitutions is set', () => {
    const priorEvents = [subEvent('e1', 1, 'side-home', 'in-1', 'out-1')];
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'out-1',
        outParticipantId: 'in-1',
        participants,
        priorEvents,
        substitutionMode: 'rolling',
        maxSubstitutions: 1,
      }),
    ).not.toThrow();
  });

  it('allows a substitution under the cap and does not enforce it when maxSubstitutions is null', () => {
    expect(() =>
      validateSubstitution({
        sideId: 'side-home',
        inParticipantId: 'in-1',
        outParticipantId: 'out-1',
        participants,
        priorEvents: [],
        substitutionMode: 'limited',
        maxSubstitutions: null,
      }),
    ).not.toThrow();
  });
});
