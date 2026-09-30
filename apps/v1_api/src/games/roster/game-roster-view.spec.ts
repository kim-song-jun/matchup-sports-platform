import { computeGameRoster, type GameRosterBaseEntry } from './game-roster-computation';
import { buildGameRosterView, decideGameRosterAccess, type GameRosterAccess } from './game-roster-view';

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
      jerseyRegistrationId: 'reg-1',
      displayNameByUserId: new Map([
        ['mgr', '팀장'],
        ['ops', '운영자'],
      ]),
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
    const result = view({ base: [fallbackEntry], computation: fallback, baseSource: 'TEAM_MEMBERS', jerseyRegistrationId: null });
    expect(result.base[0].participantId).toBeNull();
    expect(result.participants[0].participantId).toBeNull();
  });

  it('등번호 원본 신청 id 는 입력값 그대로 싣는다(팀원 기준 폴백·팀장이 아닌 뷰어는 null)', () => {
    expect(view().jerseyRegistrationId).toBe('reg-1');
    expect(view({ jerseyRegistrationId: null }).jerseyRegistrationId).toBeNull();
  });

  it('편집 가능 = 쓰기 권한 있음 AND 경기 시작 전', () => {
    expect(view().editable).toBe(true);
    expect(view({ context: { ...context, gameState: 'LIVE' } }).editable).toBe(false);
    expect(view({ access: { viewerRole: 'TEAM_MEMBER', writeRole: null } }).editable).toBe(false);
    expect(view().deadline).toEqual(KICKOFF);
    expect(view({ context: { ...context, isLeague: true } }).competitionKind).toBe('LEAGUE');
  });
});
