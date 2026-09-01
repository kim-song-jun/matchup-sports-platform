import { buildShowcaseResultParticipantPlan } from '../../prisma/showcase-result-participant-plan';
import { repairExistingShowcaseOfficialResult } from '../../prisma/showcase-official-result-repair';

const row = (participantId: string, sideId: string, goals: number) => ({
  participantId,
  sideId,
  started: true,
  minutesPlayed: 40,
  goals,
  assists: 0,
  fouls: 0,
  cards: { yellow: 0, red: 0 },
  goalkeeper: false,
});

describe('showcase result participant repair plan', () => {
  it('adds the representative player on both sides and accounts for the official score', () => {
    const plan = buildShowcaseResultParticipantPlan({
      homeSideId: 'home',
      awaySideId: 'away',
      homeParticipantId: 'home-primary',
      awayParticipantId: 'away-primary',
      homeScore: 4,
      awayScore: 2,
      currentRows: [],
    });

    expect(plan.requiresRevision).toBe(true);
    expect(plan.rows).toEqual([
      row('home-primary', 'home', 4),
      row('away-primary', 'away', 2),
    ]);
  });

  it('preserves existing participant stats and assigns only unaccounted goals', () => {
    const plan = buildShowcaseResultParticipantPlan({
      homeSideId: 'home',
      awaySideId: 'away',
      homeParticipantId: 'home-primary',
      awayParticipantId: 'away-primary',
      homeScore: 4,
      awayScore: 2,
      currentRows: [row('home-existing', 'home', 1)],
    });

    expect(plan.rows).toEqual([
      row('home-existing', 'home', 1),
      row('home-primary', 'home', 3),
      row('away-primary', 'away', 2),
    ]);
  });

  it('does not create another revision after both representative rows exist', () => {
    const currentRows = [
      row('home-primary', 'home', 4),
      row('away-primary', 'away', 2),
    ];
    const plan = buildShowcaseResultParticipantPlan({
      homeSideId: 'home',
      awaySideId: 'away',
      homeParticipantId: 'home-primary',
      awayParticipantId: 'away-primary',
      homeScore: 4,
      awayScore: 2,
      currentRows,
    });

    expect(plan.requiresRevision).toBe(false);
    expect(plan.rows).toEqual(currentRows);
  });
});
const repairInput = {
  fixtureId: 'fixture-1',
  tournamentId: 'tournament-1',
  scheduledAt: new Date('2026-08-20T10:00:00.000Z'),
  recordedAt: new Date('2026-08-20T11:00:00.000Z'),
  homeScore: 4,
  awayScore: 2,
  homeTeamId: 'home-team',
  awayTeamId: 'away-team',
  gameId: 'game-1',
  currentOfficialRevisionId: 'revision-1',
  homeSideId: 'home',
  awaySideId: 'away',
  homeParticipantId: 'home-primary',
  awayParticipantId: 'away-primary',
  homeUserId: 'home-user',
  awayUserId: 'away-user',
} as const;

function repairTransaction(currentRows: ReturnType<typeof row>[]) {
  return {
    v1GameResultRevision: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'revision-1',
        gameId: 'game-1',
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 4, away: 2 },
        goalEvents: null,
        eventsHash: 'old-hash',
        missingScorer: true,
        mvpParticipantId: null,
        outcomeReason: 'NORMAL',
        outcomeNote: null,
        officialAt: repairInput.recordedAt,
        resultParticipants: currentRows,
      }),
      create: jest.fn().mockResolvedValue({ id: 'revision-2' }),
      update: jest.fn().mockResolvedValue({}),
    },
    v1ParticipantIdentityLinkCurrent: { upsert: jest.fn().mockResolvedValue({}) },
    v1GameResultParticipant: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    v1Game: { update: jest.fn().mockResolvedValue({}) },
    v1GameOfficialFact: { create: jest.fn().mockResolvedValue({}) },
    v1TeamRecordFact: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
}

describe('existing Alpha showcase official-result repair', () => {
  it('appends an official superseding revision and moves the current pointer', async () => {
    const tx = repairTransaction([]);
    const outcome = await repairExistingShowcaseOfficialResult(tx as never, repairInput);

    expect(outcome).toBe('repaired');
    expect(tx.v1GameResultRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gameId: 'game-1',
        revision: 2,
        supersedesId: 'revision-1',
        createdBySystemActor: 'ALPHA_SHOWCASE_RESULT_SEED',
      }),
    });
    expect(tx.v1GameResultParticipant.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ participantId: 'home-primary', goals: 4 }),
        expect.objectContaining({ participantId: 'away-primary', goals: 2 }),
      ]),
    });
    expect(tx.v1Game.update).toHaveBeenCalledWith({
      where: { id: 'game-1' },
      data: { currentOfficialRevisionId: 'revision-2', version: { increment: 1 } },
    });
    expect(tx.v1GameOfficialFact.create).toHaveBeenCalledTimes(1);
    expect(tx.v1TeamRecordFact.createMany).toHaveBeenCalledTimes(1);
  });

  it('is idempotent once the current revision already contains both representatives', async () => {
    const tx = repairTransaction([
      row('home-primary', 'home', 4),
      row('away-primary', 'away', 2),
    ]);
    const outcome = await repairExistingShowcaseOfficialResult(tx as never, repairInput);

    expect(outcome).toBe('preserved');
    expect(tx.v1ParticipantIdentityLinkCurrent.upsert).toHaveBeenCalledTimes(2);
    expect(tx.v1GameResultRevision.create).not.toHaveBeenCalled();
    expect(tx.v1Game.update).not.toHaveBeenCalled();
  });
});