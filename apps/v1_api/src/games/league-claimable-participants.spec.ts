import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

/**
 * `listLeagueClaimableParticipants` (2026-08-25, claim 의 리그 확장) 의 계약 3개를
 * 고정한다:
 *
 * 1. **리그 스코프 게이트** — teamMatchId 가 그 리그의 대진이 아니면(또는 삭제됐으면)
 *    게임 인가를 태우기 전에 404 로 끊는다. 이 where 절(leagueId + deletedAt: null)이
 *    빠지면 아무 리그 id 로나 남의 팀매치 미연결 명단을 열람하는 경로가 생긴다.
 * 2. **인가는 participant_identity 스코프 재사용** — 두 참가팀의 활성 멤버가 아니면
 *    403. 새 인가 규칙을 만들지 않고 resolveActor 의 team-match 분기를 그대로 탄다.
 * 3. **이미 연결된 참가자는 목록에서 뺀다** — 남의 연결을 빼앗는 신호를 애초에 안 만든다.
 * 4. **사이드별 최신 라인업 리비전만 노출한다**(2026-08-27 감사 결함 수정) — 라인업을
 *    재저장하면 옛 리비전 참가자 행이 삭제되지 않고 그대로 남는데, 예전 코드는 gameId 로만
 *    걸러 그 폐기된 리비전의 동명이인까지 목록에 얹었다. 그 행에 연결하면 공식 결과가
 *    최신 participantId 로만 쓰여 개인 기록이 영원히 안 뜬다 — 최신 리비전만 남기는
 *    selectLineupParticipantsWithDraftFallback 스코프를 여기서도 고정한다.
 *
 * 대회 판(listClaimableParticipants)과 공통 본문을 공유하므로, 3·4번은 공통 헬퍼의
 * 회귀 방지도 겸한다.
 */
describe('GamesService.listLeagueClaimableParticipants', () => {
  const user = { id: 'user-1', accountStatus: 'active' } as V1AuthUser;

  function makeService(overrides: {
    teamMatch?: unknown;
    memberships?: unknown[];
    lineups?: unknown[];
    participants?: unknown[];
    sides?: unknown[];
    linked?: unknown[];
  }) {
    const prisma = {
      v1TeamMatch: {
        findFirst: jest.fn().mockResolvedValue(overrides.teamMatch ?? null),
      },
      v1Game: {
        findUnique: jest.fn().mockResolvedValue({
          sourceType: 'TEAM_MATCH',
          teamMatch: {
            id: 'tm-1',
            deletedAt: null,
            hostTeamId: 'team-host',
            approvedApplicantTeamId: 'team-away',
            tournamentId: 'league-1',
            leagueId: 'league-1',
            fieldId: null,
            tournament: { kind: 'regular_league' },
            league: { kind: 'regular_league' },
            tournamentDetails: null,
          },
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      v1TeamMembership: {
        findFirst: jest.fn().mockImplementation(async () => {
          const membership = overrides.memberships?.[0];
          return membership ?? null;
        }),
        findMany: jest.fn().mockResolvedValue(overrides.memberships ?? []),
      },
      v1GameLineup: {
        findMany: jest.fn().mockResolvedValue(overrides.lineups ?? []),
      },
      v1GameParticipant: {
        findMany: jest.fn().mockResolvedValue(overrides.participants ?? []),
      },
      v1GameSide: {
        findMany: jest.fn().mockResolvedValue(overrides.sides ?? [{ id: 's-1', sideKey: 'HOME', displayNameSnapshot: '블루팀' }]),
      },
      v1ParticipantIdentityLinkCurrent: {
        findMany: jest.fn().mockResolvedValue(overrides.linked ?? []),
      },
      v1ParticipantIdentityLinkEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new GamesService(
      prisma as unknown as PrismaService,
      {} as OperationAuditWriterService,
      {} as GameTakeoverService,
    );
    return { service, prisma };
  }

  it('리그 소속이 아닌 teamMatchId 는 인가를 태우기 전에 404 로 끊는다', async () => {
    const { service, prisma } = makeService({ teamMatch: null });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-other'),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURE_GAME_NOT_FOUND' } });

    // 리그 스코프 게이트의 실체 — 이 where 절이 없으면 리그 id 를 무시하고 통과한다.
    expect(prisma.v1TeamMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tm-other', leagueId: 'league-1', deletedAt: null },
      }),
    );
    expect(prisma.v1Game.findUnique).not.toHaveBeenCalled();
  });

  it('게임이 아직 없는 대진도 같은 404 코드로 끊는다', async () => {
    const { service } = makeService({ teamMatch: { game: null } });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURE_GAME_NOT_FOUND' } });
  });

  it('두 참가팀의 활성 멤버가 아니면 403 이고 참가자 목록은 조회하지 않는다', async () => {
    const { service, prisma } = makeService({
      teamMatch: { game: { id: 'game-1', version: 4 } },
      memberships: [],
    });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.v1GameParticipant.findMany).not.toHaveBeenCalled();
  });

  it('참가팀 멤버에게는 미연결 참가자만 게임 버전과 함께 돌려준다', async () => {
    const { service } = makeService({
      teamMatch: { game: { id: 'game-1', version: 4 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      // state 는 selectLineupParticipantsWithDraftFallback 의 필수 입력 — 제출된 리비전만
      // "최신"을 다툰다(DRAFT 는 후보에서 빠진다).
      lineups: [{ id: 'lineup-1', sideId: 's-1', revision: 1, state: 'SUBMITTED', invalidatedAt: null }],
      participants: [
        { id: 'p-1', sideId: 's-1', lineupId: 'lineup-1', displayNameSnapshot: '김민준', jerseyNumber: 7 },
        { id: 'p-2', sideId: 's-1', lineupId: 'lineup-1', displayNameSnapshot: '이서준', jerseyNumber: null },
      ],
      linked: [{ participantId: 'p-2' }],
    });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).resolves.toEqual({
      gameId: 'game-1',
      // requestIdentityLink 의 expectedVersion 으로 그대로 되돌아가는 값이다.
      version: 4,
      // 연결된 p-2 도 명단 인원에는 든다 — 후보 0명일 때 "모두 연결됨"과 "명단 없음"을 가르는 값.
      rosterCount: 2,
      // 리그·대회 경기 명단은 참가 명단에서 계산된 제출본이다.
      rosterSubmitted: true,
      participants: [
        { participantId: 'p-1', sideId: 's-1', sideKey: 'HOME', sideLabel: '블루팀', displayName: '김민준', jerseyNumber: 7 },
      ],
    });
  });

  it('라인업을 재저장해 폐기된 리비전의 동명이인은 목록에서 빠진다', async () => {
    // 리그 대진 참가자 생성 → 매니저가 라인업을 한 번 재저장 → revision 1(폐기)과
    // revision 2(현재)에 각각 등번호 7번 '김민준' 행이 생긴 상태를 재현한다.
    // v1GameParticipant.delete 경로가 없어 revision 1 행은 그대로 남는다
    // (team-match-lineup.service.ts saveLineup).
    const { service } = makeService({
      teamMatch: { game: { id: 'game-1', version: 6 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      lineups: [
        { id: 'lineup-1', sideId: 's-1', revision: 1, state: 'SUBMITTED', invalidatedAt: null },
        { id: 'lineup-2', sideId: 's-1', revision: 2, state: 'SUBMITTED', invalidatedAt: null },
      ],
      participants: [
        { id: 'p-stale', sideId: 's-1', lineupId: 'lineup-1', displayNameSnapshot: '김민준', jerseyNumber: 7 },
        { id: 'p-current', sideId: 's-1', lineupId: 'lineup-2', displayNameSnapshot: '김민준', jerseyNumber: 7 },
      ],
      linked: [],
    });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).resolves.toEqual({
      gameId: 'game-1',
      version: 6,
      rosterCount: 1,
      rosterSubmitted: true,
      // 폐기된 revision 1의 'p-stale'은 나오지 않는다 — 골랐다면 공식 결과가 절대
      // 매칭되지 않는 participantId였다.
      participants: [
        { participantId: 'p-current', sideId: 's-1', sideKey: 'HOME', sideLabel: '블루팀', displayName: '김민준', jerseyNumber: 7 },
      ],
    });
  });


  it('동명이인 참가자는 canonical sideKey와 팀 snapshot label을 함께 반환한다', async () => {
    const { service, prisma } = makeService({
      teamMatch: { game: { id: 'game-1', version: 7 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      lineups: [
        { id: 'lineup-home', sideId: 's-home', revision: 1, state: 'SUBMITTED', invalidatedAt: null },
        { id: 'lineup-away', sideId: 's-away', revision: 1, state: 'SUBMITTED', invalidatedAt: null },
      ],
      participants: [
        { id: 'p-home', sideId: 's-home', lineupId: 'lineup-home', displayNameSnapshot: 'E2E 선수01', jerseyNumber: null },
        { id: 'p-away', sideId: 's-away', lineupId: 'lineup-away', displayNameSnapshot: 'E2E 선수01', jerseyNumber: null },
      ],
      sides: [
        { id: 's-home', sideKey: 'HOME', displayNameSnapshot: '블루팀' },
        { id: 's-away', sideKey: 'AWAY', displayNameSnapshot: '레드팀' },
      ],
    });

    await expect(service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1')).resolves.toMatchObject({
      participants: [
        expect.objectContaining({ participantId: 'p-home', sideKey: 'HOME', sideLabel: '블루팀' }),
        expect.objectContaining({ participantId: 'p-away', sideKey: 'AWAY', sideLabel: '레드팀' }),
      ],
    });
    expect(prisma.v1GameSide.findMany).toHaveBeenCalledWith({
      where: { gameId: 'game-1', id: { in: ['s-home', 's-away'] } },
      select: { id: true, sideKey: true, displayNameSnapshot: true },
    });
  });

  it('연결된 무효 side 참가자는 검증 대상에서 먼저 제외한다', async () => {
    const { service, prisma } = makeService({
      teamMatch: { game: { id: 'game-1', version: 8 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      lineups: [{ id: 'lineup-1', sideId: 's-home', revision: 1, state: 'SUBMITTED', invalidatedAt: null }],
      participants: [
        { id: 'p-valid', sideId: 's-home', lineupId: 'lineup-1', displayNameSnapshot: '유효 선수', jerseyNumber: null },
        { id: 'p-linked-missing-side', sideId: 's-missing-linked', lineupId: 'lineup-1', displayNameSnapshot: '연결됨', jerseyNumber: null },
      ],
      sides: [{ id: 's-home', sideKey: 'HOME', displayNameSnapshot: '블루팀' }],
      linked: [{ participantId: 'p-linked-missing-side' }],
    });

    await expect(service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1')).resolves.toMatchObject({
      participants: [expect.objectContaining({ participantId: 'p-valid' })],
    });
    expect(prisma.v1GameSide.findMany).toHaveBeenCalledWith({
      where: { gameId: 'game-1', id: { in: ['s-home'] } },
      select: { id: true, sideKey: true, displayNameSnapshot: true },
    });
  });

  it('모든 후보가 연결되면 side 조회 없이 빈 목록을 반환한다', async () => {
    const { service, prisma } = makeService({
      teamMatch: { game: { id: 'game-1', version: 9 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      lineups: [{ id: 'lineup-1', sideId: 's-missing', revision: 1, state: 'SUBMITTED', invalidatedAt: null }],
      participants: [{ id: 'p-linked', sideId: 's-missing', lineupId: 'lineup-1', displayNameSnapshot: '연결됨', jerseyNumber: null }],
      linked: [{ participantId: 'p-linked' }],
      sides: [],
    });

    await expect(service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1')).resolves.toEqual({
      gameId: 'game-1', version: 9, rosterCount: 1, rosterSubmitted: true, participants: [],
    });
    expect(prisma.v1GameSide.findMany).not.toHaveBeenCalled();
  });

  it('대조군 — 아직 어느 팀도 명단을 올리지 않았으면 rosterCount 0 으로 빈 목록을 돌려준다(W5-V3)', async () => {
    const { service, prisma } = makeService({
      teamMatch: { game: { id: 'game-1', version: 2 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
    });

    await expect(service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1')).resolves.toEqual({
      gameId: 'game-1', version: 2, rosterCount: 0, rosterSubmitted: false, participants: [],
    });
    expect(prisma.v1ParticipantIdentityLinkCurrent.findMany).not.toHaveBeenCalled();
  });

  describe('친선 — rosterSubmitted(W6-V3)', () => {
    const sides = [
      { id: 's-home', sideKey: 'HOME', displayNameSnapshot: '마포 FC' },
      { id: 's-away', sideKey: 'AWAY', displayNameSnapshot: '합정 유나이티드' },
    ];
    const participants = [
      { id: 'p-home', sideId: 's-home', lineupId: 'l-home', displayNameSnapshot: '김민준', jerseyNumber: 7 },
      { id: 'p-away', sideId: 's-away', lineupId: 'l-away', displayNameSnapshot: '이서준', jerseyNumber: 9 },
      { id: 'p-guest', sideId: 's-away', lineupId: 'l-away', displayNameSnapshot: '용병 박지성', jerseyNumber: null },
    ];

    function friendly(homeState: string, awayState: string) {
      const made = makeService({
        teamMatch: { game: { id: 'game-f', version: 3 } },
        memberships: [{ teamId: 'team-host', role: 'member' }],
        lineups: [
          { id: 'l-home', sideId: 's-home', revision: 1, state: homeState, invalidatedAt: null },
          { id: 'l-away', sideId: 's-away', revision: 1, state: awayState, invalidatedAt: null },
        ],
        participants,
        // 계정 있는 팀원은 저장 때 연결된다 — 연결 안 된 건 게스트뿐이다.
        linked: [{ participantId: 'p-home' }, { participantId: 'p-away' }],
        sides,
      });
      made.prisma.v1Game.findUnique.mockResolvedValue({
        sourceType: 'TEAM_MATCH',
        teamMatch: {
          id: 'tm-1', deletedAt: null, hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away',
          tournamentId: null, leagueId: null, fieldId: null, tournament: null, league: null, tournamentDetails: null,
        },
      });
      return made.service.listTeamMatchClaimableParticipants(user, 'tm-1');
    }

    it('양 팀 모두 초안만 저장했으면 제출 전(false)이지만 명단·후보는 공식 결과와 같은 초안 기준 그대로다', async () => {
      await expect(friendly('DRAFT', 'DRAFT')).resolves.toEqual({
        gameId: 'game-f',
        version: 3,
        rosterCount: 3,
        rosterSubmitted: false,
        participants: [expect.objectContaining({ participantId: 'p-guest', sideKey: 'AWAY' })],
      });
    });

    it('한 팀만 제출했어도 제출됨(true) — "아직 제출된 참석명단이 없어요"는 거짓이 된다', async () => {
      await expect(friendly('SUBMITTED', 'DRAFT')).resolves.toMatchObject({ rosterCount: 3, rosterSubmitted: true });
    });

    it('양 팀 모두 제출했으면 제출됨(true)', async () => {
      await expect(friendly('SUBMITTED', 'LOCKED')).resolves.toMatchObject({ rosterCount: 3, rosterSubmitted: true });
    });
  });

  it('참가자 side가 없으면 조용히 라벨을 추측하지 않고 무결성 충돌을 반환한다', async () => {
    const { service } = makeService({
      teamMatch: { game: { id: 'game-1', version: 7 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      lineups: [{ id: 'lineup-1', sideId: 's-missing', revision: 1, state: 'SUBMITTED', invalidatedAt: null }],
      participants: [{ id: 'p-missing', sideId: 's-missing', lineupId: 'lineup-1', displayNameSnapshot: 'E2E 선수01', jerseyNumber: null }],
      sides: [],
    });

    await expect(service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1')).rejects.toMatchObject({
      response: { code: 'GAME_SIDE_CONTEXT_MISSING' },
    });
  });
});
