import {
  computeGameRoster,
  type GameRosterAdjustmentInput,
  type GameRosterBaseEntry,
  type GameRosterUnavailabilityInput,
} from './game-roster-computation';

function entry(userId: string, overrides: Partial<GameRosterBaseEntry> = {}): GameRosterBaseEntry {
  return {
    userId,
    accountLinked: true,
    displayNameSnapshot: `선수-${userId}`,
    jerseyNumber: null,
    sourceParticipantId: `player-${userId}`,
    ...overrides,
  };
}

function exclude(userId: string, overrides: Partial<GameRosterAdjustmentInput> = {}): GameRosterAdjustmentInput {
  return {
    id: `adj-${userId}`,
    userId,
    reason: 'INJURY',
    actorUserId: 'manager-1',
    actorRole: 'TEAM_MANAGER',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    revokedAt: null,
    ...overrides,
  };
}

function away(
  userId: string,
  startsAt: string,
  endsAt: string,
  overrides: Partial<GameRosterUnavailabilityInput> = {},
): GameRosterUnavailabilityInput {
  return {
    id: `unav-${userId}-${startsAt}`,
    userId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    reason: 'PERSONAL',
    actorUserId: 'manager-1',
    actorRole: 'TEAM_MANAGER',
    revokedAt: null,
    ...overrides,
  };
}

const KICKOFF = new Date('2026-10-10T10:00:00Z');
const BASE = [entry('u1', { jerseyNumber: 7 }), entry('u2'), entry('u3'), entry('u4')];
const NO_VERDICTS = new Map();

function ids(rows: ReadonlyArray<{ entry: GameRosterBaseEntry }>): string[] {
  return rows.map((row) => row.entry.userId);
}

describe('computeGameRoster — 경기 명단 = 기준 − 조정 − 결장 − 출전정지', () => {
  it('조정·결장·정지가 없으면 기준 명단 그대로(순서·등번호 포함)다', () => {
    const roster = computeGameRoster({
      base: BASE,
      adjustments: [],
      unavailabilities: [],
      gameStartAt: KICKOFF,
      suspensionVerdicts: NO_VERDICTS,
    });
    expect(roster.participants).toEqual(BASE);
    expect(roster.excluded).toEqual([]);
    expect(roster.unavailable).toEqual([]);
    expect(roster.suspended).toEqual([]);
  });

  it('활성 EXCLUDE 는 그 사람만 빼고 사유·actorRole 을 남긴다', () => {
    const roster = computeGameRoster({
      base: BASE,
      adjustments: [exclude('u2', { reason: 'LATE_OR_EARLY', actorRole: 'ADMIN', actorUserId: 'admin-1' })],
      unavailabilities: [],
      gameStartAt: KICKOFF,
      suspensionVerdicts: NO_VERDICTS,
    });
    expect(roster.participants.map((row) => row.userId)).toEqual(['u1', 'u3', 'u4']);
    expect(roster.excluded).toEqual([
      expect.objectContaining({
        entry: BASE[1],
        adjustmentId: 'adj-u2',
        reason: 'LATE_OR_EARLY',
        actorRole: 'ADMIN',
        actorUserId: 'admin-1',
      }),
    ]);
  });

  it('되돌린(revokedAt) 조정은 계산에 들어가지 않는다 — 다른 사람의 활성 조정은 그대로 적용된다', () => {
    const roster = computeGameRoster({
      base: BASE,
      adjustments: [exclude('u1', { revokedAt: new Date('2026-10-02T00:00:00Z') }), exclude('u3')],
      unavailabilities: [],
      gameStartAt: KICKOFF,
      suspensionVerdicts: NO_VERDICTS,
    });
    expect(roster.participants.map((row) => row.userId)).toEqual(['u1', 'u2', 'u4']);
    expect(ids(roster.excluded)).toEqual(['u3']);
  });

  it('기준 명단 밖 userId 의 조정·결장·정지는 무시한다(다른 팀 선수가 끼어들지 않는다)', () => {
    const roster = computeGameRoster({
      base: BASE,
      adjustments: [exclude('outsider-1')],
      unavailabilities: [away('outsider-2', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z')],
      gameStartAt: KICKOFF,
      suspensionVerdicts: new Map([['outsider-3', { suspended: true, reason: '퇴장', remainingMatches: 1 }]]),
    });
    expect(roster.participants).toEqual(BASE);
    expect([...roster.excluded, ...roster.unavailable, ...roster.suspended]).toEqual([]);
  });
});

describe('computeGameRoster — 결장 기간 경계 [startsAt, endsAt)', () => {
  function unavailableIds(unavailability: GameRosterUnavailabilityInput): string[] {
    return ids(
      computeGameRoster({
        base: BASE,
        adjustments: [],
        unavailabilities: [unavailability],
        gameStartAt: KICKOFF,
        suspensionVerdicts: NO_VERDICTS,
      }).unavailable,
    );
  }

  it('시작 시각이 startsAt 과 같으면 빠진다(닫힌 시작)', () => {
    expect(unavailableIds(away('u1', '2026-10-10T10:00:00Z', '2026-10-11T00:00:00Z'))).toEqual(['u1']);
  });

  it('시작 시각이 endsAt 과 같으면 빠지지 않는다(열린 끝)', () => {
    expect(unavailableIds(away('u1', '2026-10-09T00:00:00Z', '2026-10-10T10:00:00Z'))).toEqual([]);
  });

  it('startsAt 1ms 뒤에 시작하는 기간·endsAt 1ms 앞에서 끝나는 기간은 경기와 무관하다', () => {
    expect(unavailableIds(away('u1', '2026-10-10T10:00:00.001Z', '2026-10-12T00:00:00Z'))).toEqual([]);
    expect(unavailableIds(away('u1', '2026-10-01T00:00:00Z', '2026-10-10T09:59:59.999Z'))).toEqual([]);
  });

  it('endsAt 1ms 전까지 이어지는 기간은 경기를 덮는다', () => {
    expect(unavailableIds(away('u1', '2026-10-01T00:00:00Z', '2026-10-10T10:00:00.001Z'))).toEqual(['u1']);
  });

  it('취소한(revokedAt) 결장 기간은 적용하지 않는다', () => {
    expect(
      unavailableIds(
        away('u1', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z', { revokedAt: new Date('2026-10-02T00:00:00Z') }),
      ),
    ).toEqual([]);
  });

  it('시작 시각이 아직 없는 경기에는 결장 기간을 적용하지 않는다', () => {
    const roster = computeGameRoster({
      base: BASE,
      adjustments: [],
      unavailabilities: [away('u1', '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z')],
      gameStartAt: null,
      suspensionVerdicts: NO_VERDICTS,
    });
    expect(roster.unavailable).toEqual([]);
    expect(roster.participants).toEqual(BASE);
  });

  it('기간이 여러 개면 경기를 덮는 것 중 가장 먼저 시작한 기간을 사유로 쓴다', () => {
    const roster = computeGameRoster({
      base: BASE,
      adjustments: [],
      unavailabilities: [
        away('u2', '2026-10-09T00:00:00Z', '2026-10-11T00:00:00Z', { id: 'later', reason: 'OTHER' }),
        away('u2', '2026-10-01T00:00:00Z', '2026-10-30T00:00:00Z', { id: 'earlier', reason: 'INJURY' }),
      ],
      gameStartAt: KICKOFF,
      suspensionVerdicts: NO_VERDICTS,
    });
    expect(roster.unavailable).toEqual([
      expect.objectContaining({ unavailabilityId: 'earlier', reason: 'INJURY' }),
    ]);
  });
});

describe('computeGameRoster — 사유가 겹칠 때 우선순위: 출전정지 > 결장 > 조정', () => {
  const allThree = computeGameRoster({
    base: BASE,
    adjustments: [exclude('u1'), exclude('u2'), exclude('u3')],
    unavailabilities: [
      away('u1', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z'),
      away('u2', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z'),
    ],
    gameStartAt: KICKOFF,
    suspensionVerdicts: new Map([
      ['u1', { suspended: true, reason: '레드카드 1장 · 1경기 정지', remainingMatches: 2 }],
      ['u4', { suspended: false, reason: null, remainingMatches: 0 }],
    ]),
  });

  it('세 사유가 모두 걸린 사람은 출전정지로만 나온다', () => {
    expect(ids(allThree.suspended)).toEqual(['u1']);
    expect(allThree.suspended[0]).toEqual(
      expect.objectContaining({ reason: '레드카드 1장 · 1경기 정지', remainingMatches: 2 }),
    );
  });

  it('결장과 조정이 겹치면 결장으로 나온다', () => {
    expect(ids(allThree.unavailable)).toEqual(['u2']);
  });

  it('조정만 있는 사람은 조정으로 나오고, 한 사람은 한 칸에만 있다', () => {
    expect(ids(allThree.excluded)).toEqual(['u3']);
    const everyone = [
      ...allThree.participants.map((row) => row.userId),
      ...ids(allThree.suspended),
      ...ids(allThree.unavailable),
      ...ids(allThree.excluded),
    ];
    expect(everyone.sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('정지 판정이 suspended=false 인 선수(카드 누적만 있는 선수)는 출전한다', () => {
    expect(allThree.participants.map((row) => row.userId)).toEqual(['u4']);
  });
});

describe('computeGameRoster — 리그 폴백 팀(계정 연결 없는 팀원)', () => {
  const fallback = [
    entry('m1', { accountLinked: false, sourceParticipantId: 'membership-1' }),
    entry('m2', { accountLinked: false, sourceParticipantId: 'membership-2' }),
    entry('m3', { accountLinked: false, sourceParticipantId: 'membership-3' }),
  ];

  it('매칭 키(멤버십 userId)로 조정·결장이 걸리고, 출전자에는 계정 연결 없음이 유지된다', () => {
    const roster = computeGameRoster({
      base: fallback,
      adjustments: [exclude('m1')],
      unavailabilities: [away('m2', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z')],
      gameStartAt: KICKOFF,
      suspensionVerdicts: NO_VERDICTS,
    });
    expect(roster.participants).toEqual([fallback[2]]);
    expect(roster.participants[0].accountLinked).toBe(false);
    expect(ids(roster.excluded)).toEqual(['m1']);
    expect(ids(roster.unavailable)).toEqual(['m2']);
  });
});
