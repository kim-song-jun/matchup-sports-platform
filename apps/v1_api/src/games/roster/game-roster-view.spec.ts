import { computeGameRoster, type GameRosterBaseEntry } from './game-roster-computation';
import { buildGameRosterView, decideGameRosterAccess, type GameRosterAccess, type PlayedLineupRow } from './game-roster-view';

describe('decideGameRosterAccess — 사이드 팀 멤버십 · 운영자', () => {
  const noOperator = null;

  it('사이드 팀 owner·manager 는 팀장으로 쓴다', () => {
    for (const role of ['owner', 'manager'] as const) {
      expect(decideGameRosterAccess({ sideMembershipRole: role, operator: noOperator })).toEqual({
        viewerRole: 'TEAM_MANAGER',
        writeRole: 'TEAM_MANAGER',
      });
    }
  });

  it('사이드 팀 일반 멤버는 읽기만 한다', () => {
    expect(decideGameRosterAccess({ sideMembershipRole: 'member', operator: noOperator })).toEqual({
      viewerRole: 'TEAM_MEMBER',
      writeRole: null,
    });
  });

  it('사이드 팀 멤버가 아니고 운영자도 아니면(상대팀 팀장 포함) 거부한다', () => {
    expect(decideGameRosterAccess({ sideMembershipRole: null, operator: noOperator })).toBeNull();
  });

  it('플랫폼 운영자는 ADMIN, 쓰기 가능한 대회 스태프는 STAFF 로 쓴다', () => {
    expect(
      decideGameRosterAccess({ sideMembershipRole: null, operator: { role: 'platform_ops', canMutateLineup: true, platformAdmin: true } }),
    ).toEqual({ viewerRole: 'ADMIN', writeRole: 'ADMIN' });
    for (const role of ['tournament_director', 'field_operator'] as const) {
      expect(decideGameRosterAccess({ sideMembershipRole: null, operator: { role, canMutateLineup: true, platformAdmin: false } })).toEqual({
        viewerRole: 'STAFF',
        writeRole: 'STAFF',
      });
    }
  });

  it('support_readonly 는 라인업 쓰기 판정이 열려 있어도 조정은 읽기만 한다', () => {
    expect(
      decideGameRosterAccess({
        sideMembershipRole: null,
        operator: { role: 'support_readonly', canMutateLineup: true, platformAdmin: false },
      }),
    ).toEqual({ viewerRole: 'STAFF', writeRole: null });
  });

  it('support 어드민은 어드민으로 읽기만 한다', () => {
    expect(
      decideGameRosterAccess({
        sideMembershipRole: null,
        operator: { role: 'support_readonly', canMutateLineup: false, platformAdmin: true },
      }),
    ).toEqual({ viewerRole: 'ADMIN', writeRole: null });
  });

  it('담당 구장 밖 현장 스태프처럼 쓰기 판정이 없는 운영자는 읽기만 한다', () => {
    expect(
      decideGameRosterAccess({ sideMembershipRole: null, operator: { role: 'field_operator', canMutateLineup: false, platformAdmin: false } }),
    ).toEqual({ viewerRole: 'STAFF', writeRole: null });
  });

  it('일반 멤버이면서 운영자면 운영자 권한이 이긴다(팀장 권한은 멤버십이 먼저)', () => {
    expect(
      decideGameRosterAccess({ sideMembershipRole: 'member', operator: { role: 'platform_ops', canMutateLineup: true, platformAdmin: true } }),
    ).toEqual({ viewerRole: 'ADMIN', writeRole: 'ADMIN' });
  });
});

describe('buildGameRosterView', () => {
  const entry = (userId: string, overrides: Partial<GameRosterBaseEntry> = {}): GameRosterBaseEntry => ({
    userId,
    accountLinked: true,
    displayNameSnapshot: `선수-${userId}`,
    jerseyNumber: null,
    sourceParticipantId: `tp-${userId}`,
    ...overrides,
  });
  const BASE = [entry('u1', { jerseyNumber: 7 }), entry('u2'), entry('u3'), entry('u4'), entry('u5')];
  const KICKOFF = new Date('2026-10-10T10:00:00Z');
  const context = {
    gameId: 'g1',
    sideId: 's1',
    teamId: 't1',
    teamMatchId: 'tm1',
    competitionId: 'c1',
    isLeague: false,
    gameState: 'SCHEDULED' as const,
    startAt: KICKOFF,
  };
  const computation = computeGameRoster({
    base: BASE,
    adjustments: [
      {
        id: 'adj-1',
        userId: 'u2',
        reason: 'INJURY',
        actorUserId: 'mgr',
        actorRole: 'TEAM_MANAGER',
        createdAt: new Date('2026-10-09T12:00:00Z'),
        revokedAt: null,
      },
    ],
    unavailabilities: [
      {
        id: 'un-1',
        userId: 'u3',
        startsAt: new Date('2026-10-01T00:00:00Z'),
        endsAt: new Date('2026-10-20T00:00:00Z'),
        reason: 'PERSONAL',
        actorUserId: 'ops',
        actorRole: 'ADMIN',
        revokedAt: null,
      },
    ],
    gameStartAt: KICKOFF,
    suspensionVerdicts: new Map([['u4', { suspended: true, reason: '레드카드 1장 · 1경기 정지', remainingMatches: 1 }]]),
  });
  const manager: GameRosterAccess = { viewerRole: 'TEAM_MANAGER', writeRole: 'TEAM_MANAGER' };
  const view = (overrides: Partial<Parameters<typeof buildGameRosterView>[0]> = {}) =>
    buildGameRosterView({
      context,
      access: manager,
      baseSource: 'REGISTRATION',
      base: BASE,
      computation,
      fixtureSnapshotUserIds: new Set(['u1', 'u2', 'u3', 'u4']),
      legacyLineupPending: false,
      jerseyRegistration: { id: 'reg-1', editable: true },
      displayNameByUserId: new Map([
        ['mgr', '팀장'],
        ['ops', '운영자'],
      ]),
      playedLineup: null,
      ...overrides,
    });

  it('기준 명단 순서대로 상태를 붙이고 칸별 수를 센다', () => {
    const result = view();
    expect(result.base.map((row) => [row.userId, row.status])).toEqual([
      ['u1', 'PARTICIPATING'],
      ['u2', 'EXCLUDED'],
      ['u3', 'UNAVAILABLE'],
      ['u4', 'SUSPENDED'],
      ['u5', 'PARTICIPATING'],
    ]);
    expect(result.counts).toEqual({ base: 5, participating: 2, excluded: 1, unavailable: 1, suspended: 1 });
    expect(result.participants.map((row) => row.userId)).toEqual(['u1', 'u5']);
    expect(result.participants[0].jerseyNumber).toBe(7);
  });

  it('빠진 사람에 사유·행위자·시각, 정지에 남은 경기 수, 결장에 기간을 싣는다', () => {
    const result = view();
    expect(result.excluded).toEqual([
      expect.objectContaining({
        userId: 'u2',
        reason: 'INJURY',
        excludedAt: new Date('2026-10-09T12:00:00Z'),
        actor: { userId: 'mgr', displayName: '팀장', role: 'TEAM_MANAGER' },
      }),
    ]);
    expect(result.suspended).toEqual([
      expect.objectContaining({ userId: 'u4', reason: '레드카드 1장 · 1경기 정지', remainingMatches: 1 }),
    ]);
    expect(result.unavailable).toEqual([
      expect.objectContaining({ userId: 'u3', actor: { userId: 'ops', displayName: '운영자', role: 'ADMIN' } }),
    ]);
  });

  it('대진 시점 명단에 없던 계정만 "참가 명단에 추가돼 들어옴"으로 표시한다', () => {
    const result = view();
    expect(result.participants.map((row) => [row.userId, row.joinedAfterFixtureCreated])).toEqual([
      ['u1', false],
      ['u5', true],
    ]);
  });

  it('비교할 대진 시점 명단이 없거나 계정 없는 폴백 팀원이면 표시하지 않는다', () => {
    expect(view({ fixtureSnapshotUserIds: null }).participants.every((row) => !row.joinedAfterFixtureCreated)).toBe(true);
    const fallback = computeGameRoster({
      base: [entry('m1', { accountLinked: false })],
      adjustments: [],
      unavailabilities: [],
      gameStartAt: KICKOFF,
      suspensionVerdicts: new Map(),
    });
    const result = view({ base: [entry('m1', { accountLinked: false })], computation: fallback, fixtureSnapshotUserIds: new Set() });
    expect(result.participants).toEqual([expect.objectContaining({ userId: 'm1', joinedAfterFixtureCreated: false })]);
  });

  it('참가 명단 선수에는 등번호 저장 API 의 :playerId 를, 계정 없는 폴백 팀원에는 null 을 싣는다 — 다섯 목록 모두', () => {
    const linked = view();
    for (const row of [...linked.base, ...linked.participants, ...linked.excluded, ...linked.unavailable, ...linked.suspended]) {
      expect(row.participantId).toBe(`tp-${row.userId}`);
    }
    // 폴백 팀원의 sourceParticipantId 는 멤버십 id 다 — 그대로 내보내면 :playerId 로 쓰다 404 가 난다.
    const fallbackEntry = entry('m1', { accountLinked: false, sourceParticipantId: 'membership-1' });
    const fallback = computeGameRoster({
      base: [fallbackEntry],
      adjustments: [],
      unavailabilities: [],
      gameStartAt: KICKOFF,
      suspensionVerdicts: new Map(),
    });
    const result = view({ base: [fallbackEntry], computation: fallback, baseSource: 'TEAM_MEMBERS', jerseyRegistration: null });
    expect(result.base[0].participantId).toBeNull();
    expect(result.participants[0].participantId).toBeNull();
  });

  it('등번호 원본 신청 id 는 입력값 그대로 싣는다(팀원 기준 폴백·팀장이 아닌 뷰어는 null)', () => {
    expect(view().jerseyRegistrationId).toBe('reg-1');
    expect(view({ jerseyRegistration: null }).jerseyRegistrationId).toBeNull();
  });

  it('잠긴 명단은 신청 id 는 그대로 주되(참가 명단 링크) 등번호 편집은 막는다', () => {
    const locked = view({ jerseyRegistration: { id: 'reg-1', editable: false } });
    expect(locked.jerseyRegistrationId).toBe('reg-1');
    expect(locked.jerseyEditable).toBe(false);
    expect(view().jerseyEditable).toBe(true);
    expect(view({ jerseyRegistration: null }).jerseyEditable).toBe(false);
  });

  it('편집 가능 = 쓰기 권한 있음 AND 경기 시작 전', () => {
    expect(view().editable).toBe(true);
    expect(view({ context: { ...context, gameState: 'LIVE' } }).editable).toBe(false);
    expect(view({ access: { viewerRole: 'TEAM_MEMBER', writeRole: null } }).editable).toBe(false);
    expect(view().deadline).toEqual(KICKOFF);
    expect(view({ context: { ...context, isLeague: true } }).competitionKind).toBe('LEAGUE');
  });

  // 시작된 경기의 출전은 기록 명단이 정한다. 시작 뒤 참가 명단에 넣은 선수를 계산으로 "출전"에 넣어 보여 주던
  // 결함(alpha 재현 2026-10-01: LIVE 경기에 방금 추가한 선수가 출전·"참가 명단에 추가돼 들어갔어요")을 막는다.
  describe('시작된 경기', () => {
    const live = { ...context, gameState: 'LIVE' as const };
    const played = (userId: string | null, overrides: Partial<PlayedLineupRow> = {}): PlayedLineupRow => ({
      id: `gp-${userId ?? 'x'}`,
      userId,
      displayNameSnapshot: `선수-${userId}`,
      jerseyNumber: null,
      ...overrides,
    });
    // 시작 뒤 참가 명단에 들어온 u6 — 계산에는 들어가지만 기록 명단에는 없다.
    const BASE_AFTER_START = [...BASE, entry('u6')];
    const computationAfterStart = computeGameRoster({
      base: BASE_AFTER_START,
      adjustments: [],
      unavailabilities: [],
      gameStartAt: KICKOFF,
      suspensionVerdicts: new Map(),
    });

    it('시작 뒤 참가 명단에 넣은 선수는 출전·기준 명단에 넣지 않고 "새로 들어옴"으로도 알리지 않는다', () => {
      const result = view({
        context: live,
        base: BASE_AFTER_START,
        computation: computationAfterStart,
        playedLineup: [played('u1', { jerseyNumber: 7 }), played('u5')],
      });
      // u5 는 대진 뒤·시작 전에 들어와 기록에도 있으니 "새로 들어옴"이 맞다. u6 은 아예 없어야 한다.
      expect(result.participants.map((row) => [row.userId, row.joinedAfterFixtureCreated])).toEqual([
        ['u1', false],
        ['u5', true],
      ]);
      expect(result.base.map((row) => row.userId)).not.toContain('u6');
      expect(result.counts.participating).toBe(2);
    });

    it('대조군: 시작 전 경기는 같은 입력에서 계산한 출전자를 그대로 보여 준다', () => {
      const result = view({ base: BASE_AFTER_START, computation: computationAfterStart });
      expect(result.participants.map((row) => row.userId)).toContain('u6');
    });

    it('기록된 등번호·이름을 보여 주고, 참가 명단에서 사라진 기록 선수도 지우지 않는다', () => {
      const result = view({
        context: live,
        playedLineup: [played('u1', { jerseyNumber: 99, displayNameSnapshot: '기록 이름' }), played('gone')],
      });
      expect(result.participants).toEqual([
        expect.objectContaining({ userId: 'u1', jerseyNumber: 99, displayName: '기록 이름', participantId: 'tp-u1' }),
        expect.objectContaining({ userId: 'gone', accountLinked: true, participantId: null }),
      ]);
    });

    it('기록에 있는 선수는 시작 뒤 생긴 결장·정지로 "빠짐"이 되지 않고, 기록에 없는 사유 있는 선수는 남는다', () => {
      const result = view({ context: live, playedLineup: [played('u1'), played('u3'), played('u4'), played('u5')] });
      expect(result.unavailable).toEqual([]);
      expect(result.suspended).toEqual([]);
      expect(result.excluded.map((row) => row.userId)).toEqual(['u2']);
      // 시작 뒤 기준 명단도 같은 표시 순서(등번호 → 이름)다.
      expect(result.base.map((row) => [row.userId, row.status])).toEqual([
        ['u1', 'PARTICIPATING'],
        ['u2', 'EXCLUDED'],
        ['u3', 'PARTICIPATING'],
        ['u4', 'PARTICIPATING'],
        ['u5', 'PARTICIPATING'],
      ]);
      expect(result.counts).toEqual({ base: 5, participating: 4, excluded: 1, unavailable: 0, suspended: 0 });
    });

    it('계정 없이 기록된 리그 폴백 팀원은 이름으로 팀원과 이어 계정 없음으로 둔다', () => {
      const fallbackBase = [entry('m1', { accountLinked: false, displayNameSnapshot: '김폴백', sourceParticipantId: 'membership-1' })];
      const fallback = computeGameRoster({
        base: fallbackBase,
        adjustments: [],
        unavailabilities: [],
        gameStartAt: KICKOFF,
        suspensionVerdicts: new Map(),
      });
      const result = view({
        context: live,
        base: fallbackBase,
        computation: fallback,
        baseSource: 'TEAM_MEMBERS',
        playedLineup: [played(null, { displayNameSnapshot: '김폴백' }), played(null, { id: 'gp-left', displayNameSnapshot: '나간 팀원' })],
      });
      expect(result.participants.map((row) => [row.userId, row.accountLinked, row.participantId])).toEqual([
        ['m1', false, null],
        ['game-participant:gp-left', false, null],
      ]);
      expect(result.base.find((row) => row.userId === 'm1')?.accountLinked).toBe(false);
    });
  });
});
