import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';
import { writeIdentityAttestRequestNotifications } from './identity-attest-notification';

/**
 * attest UI C안 (2026-08-26) 의 서버 계약 2개를 고정한다.
 *
 * 1. `listPendingIdentityLinkRequests` — 승인함 목록의 노출 규칙:
 *    본인 신청 제외 / 종결(ATTESTED 등) 제외 / **내 승인 자격 밖 사이드 제외**.
 *    마지막 것이 핵심이다 — TEAM_MATCH 승인 자격은 "그 참가자 사이드 팀의
 *    owner/manager"라, 상대 사이드 요청이 새어 나오면 승인할 수 없는 행이 생기고
 *    (누르면 403), 남의 팀 미연결 신청 현황이 노출된다.
 * 2. `writeIdentityAttestRequestNotifications` — 발송 규칙: 수신자(사이드 리더/등록팀
 *    리더), 신청자 본인 제외, businessKey 멱등 키, 선호도 게이트, 소스별 딥링크.
 */
describe('identity attest (승인함)', () => {
  const user = { id: 'me', accountStatus: 'active' } as V1AuthUser;
  const HOUR = 60 * 60 * 1000;

  describe('GamesService.listPendingIdentityLinkRequests', () => {
    function makeService() {
      const requestedAt = new Date(Date.now() - HOUR);
      const prisma = {
        v1Game: {
          findUnique: jest.fn().mockResolvedValue({
            version: 7,
            sourceType: 'TEAM_MATCH',
            teamMatch: { hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away' },
            tournamentFixture: null,
          }),
        },
        v1AdminUser: { findUnique: jest.fn().mockResolvedValue(null) },
        v1TeamMembership: {
          // resolveActor(참가팀 멤버 게이트)용 — 나는 호스트팀 manager 다.
          findMany: jest.fn().mockResolvedValue([{ teamId: 'team-host', role: 'manager' }]),
          // assertAttestorAuthority(사이드별 승인 자격)용 — 호스트팀만 통과한다.
          findFirst: jest.fn().mockImplementation(({ where }: { where: { teamId: string } }) =>
            Promise.resolve(where.teamId === 'team-host' ? { teamId: 'team-host', role: 'manager' } : null),
          ),
        },
        v1GameParticipant: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'p-home', sideId: 's-h', displayNameSnapshot: '김민준', jerseyNumber: 9 },
            { id: 'p-away', sideId: 's-a', displayNameSnapshot: '이서준', jerseyNumber: null },
            { id: 'p-done', sideId: 's-h', displayNameSnapshot: '박도윤', jerseyNumber: 4 },
            { id: 'p-mine', sideId: 's-h', displayNameSnapshot: '나야나', jerseyNumber: 11 },
          ]),
        },
        v1ParticipantIdentityLinkEvent: {
          findMany: jest.fn().mockResolvedValue([
            // 노출돼야 하는 유일한 행 — 내 사이드(호스트) 참가자의 타인 신청.
            { requestId: 'req-1', participantId: 'p-home', action: 'REQUESTED', userId: 'someone', effectiveAt: requestedAt, eventVersion: 1 },
            // 상대 사이드 — 내 승인 자격 밖.
            { requestId: 'req-2', participantId: 'p-away', action: 'REQUESTED', userId: 'other', effectiveAt: requestedAt, eventVersion: 2 },
            // 이미 종결.
            { requestId: 'req-3', participantId: 'p-done', action: 'REQUESTED', userId: 'third', effectiveAt: requestedAt, eventVersion: 3 },
            { requestId: 'req-3', participantId: 'p-done', action: 'ATTESTED', userId: 'third', effectiveAt: requestedAt, eventVersion: 4 },
            // 본인 신청 — 스스로 승인할 수 없다.
            { requestId: 'req-4', participantId: 'p-mine', action: 'REQUESTED', userId: 'me', effectiveAt: requestedAt, eventVersion: 5 },
          ]),
        },
        v1GameSide: {
          findMany: jest.fn().mockResolvedValue([
            { id: 's-h', teamId: 'team-host' },
            { id: 's-a', teamId: 'team-away' },
          ]),
        },
        v1UserProfile: {
          findMany: jest.fn().mockResolvedValue([{ userId: 'someone', nickname: '검증자닉' }]),
        },
      };
      const service = new GamesService(
        prisma as unknown as PrismaService,
        {} as OperationAuditWriterService,
        {} as GameTakeoverService,
      );
      return { service, prisma, requestedAt };
    }

    it('본인 신청·종결 건·자격 밖 사이드를 걸러 승인 가능한 요청만 버전과 함께 돌려준다', async () => {
      const { service, requestedAt } = makeService();

      const result = await service.listPendingIdentityLinkRequests(user, 'game-1');

      expect(result.version).toBe(7);
      expect(result.requests).toEqual([
        {
          requestId: 'req-1',
          participantId: 'p-home',
          participantDisplayName: '김민준',
          jerseyNumber: 9,
          sideId: 's-h',
          requesterNickname: '검증자닉',
          requestedAt: requestedAt.toISOString(),
          expiresAt: new Date(requestedAt.getTime() + 24 * HOUR).toISOString(),
        },
      ]);
    });

    it('승인 자격 판정 중 발생한 진짜 오류(DB 등)는 빈 목록으로 숨기지 않고 그대로 던진다', async () => {
      const { service, prisma } = makeService();
      // 자격 판정용 조회가 터진다 — forbidden(자격 밖)과 구분되어야 한다. 함께 삼키면
      // 실제 장애가 "승인할 요청이 없음"으로 위장돼 화면에서 사라진다(Copilot 리뷰).
      prisma.v1TeamMembership.findFirst.mockRejectedValue(new Error('DB down'));

      await expect(service.listPendingIdentityLinkRequests(user, 'game-1')).rejects.toThrow('DB down');
    });
  });

  describe('writeIdentityAttestRequestNotifications', () => {
    function makeTx(overrides: {
      game: unknown;
      memberships: unknown[];
      preferences?: unknown[];
    }) {
      return {
        v1Game: { findUnique: jest.fn().mockResolvedValue(overrides.game) },
        v1GameParticipant: {
          findFirst: jest.fn().mockResolvedValue({ displayNameSnapshot: '김민준', sideId: 's-h' }),
        },
        v1GameSide: {
          findUnique: jest.fn().mockResolvedValue({ teamId: 'team-host' }),
        },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue(overrides.memberships) },
        v1NotificationPreference: {
          findMany: jest.fn().mockResolvedValue(overrides.preferences ?? []),
        },
        v1Notification: {
          // 기본은 "아직 아무에게도 배달 안 됨" — 재시도 케이스만 이 값을 덮는다.
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
    }

    it('팀매치(리그): 사이드 팀 리더에게 신청자 제외·businessKey 멱등으로 남기고 /team-matches 로 보낸다', async () => {
      const tx = makeTx({
        game: { sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', tournamentFixture: null },
        memberships: [{ userId: 'leader-1' }, { userId: 'requester' }],
      });

      await writeIdentityAttestRequestNotifications(tx as never, {
        gameId: 'game-1',
        participantId: 'p-1',
        requestId: 'req-1',
        requesterUserId: 'requester',
      });

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            recipientUserId: 'leader-1',
            targetType: 'team_match',
            targetId: 'tm-1',
            // 리그 대진이면 /team-matches/:id 의 서버 redirect 가 리그 경기 상세로 보낸다.
            deepLink: '/team-matches/tm-1',
            businessKey: 'identity-attest:req-1:leader-1',
          }),
        ],
        skipDuplicates: true,
      });
      const [{ data }] = tx.v1Notification.createMany.mock.calls[0] as [{ data: { body: string }[] }];
      expect(data[0].body).toContain('김민준');
    });

    it('새로 배달된 수신자만 커밋 뒤 푸시 대상으로 돌려준다(재시도 시 중복 푸시 없음)', async () => {
      const tx = makeTx({
        game: { sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', tournamentFixture: null },
        memberships: [{ userId: 'leader-1' }, { userId: 'leader-2' }],
      });
      // leader-1 은 이미 같은 요청으로 알림을 받은 상태(커맨드 재시도).
      tx.v1Notification.findMany = jest
        .fn()
        .mockResolvedValue([{ businessKey: 'identity-attest:req-1:leader-1' }]);

      const plan = await writeIdentityAttestRequestNotifications(tx as never, {
        gameId: 'game-1',
        participantId: 'p-1',
        requestId: 'req-1',
        requesterUserId: 'requester',
      });

      expect(plan).toEqual({
        recipients: ['leader-2'],
        title: '기록 연결 승인 요청이 도착했어요',
        body: expect.stringContaining('김민준'),
        url: '/team-matches/tm-1',
      });
    });

    it('선호도(teamMatchEnabled=false)로 꺼진 수신자에게는 남기지 않는다', async () => {
      const tx = makeTx({
        game: { sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', tournamentFixture: null },
        memberships: [{ userId: 'leader-1' }],
        preferences: [{ userId: 'leader-1', teamMatchEnabled: false, activityEnabled: true }],
      });

      await writeIdentityAttestRequestNotifications(tx as never, {
        gameId: 'game-1',
        participantId: 'p-1',
        requestId: 'req-1',
        requesterUserId: 'requester',
      });

      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });

    it('대회: 두 등록팀 리더에게 복합 targetId 로 경기 상세 딥링크를 남긴다', async () => {
      const tx = makeTx({
        game: {
          sourceType: 'TOURNAMENT_FIXTURE',
          teamMatchId: null,
          tournamentFixture: {
            id: 'fx-1',
            tournamentId: 't-1',
            homeRegistration: { teamId: 'team-h' },
            awayRegistration: { teamId: 'team-a' },
          },
        },
        memberships: [{ userId: 'leader-h' }, { userId: 'leader-a' }],
      });

      await writeIdentityAttestRequestNotifications(tx as never, {
        gameId: 'game-1',
        participantId: 'p-1',
        requestId: 'req-9',
        requesterUserId: 'requester',
      });

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            targetType: 'tournament',
            targetId: 't-1:fx-1',
            deepLink: '/tournaments/t-1/matches/fx-1',
            businessKey: 'identity-attest:req-9:leader-h',
          }),
        ]),
        skipDuplicates: true,
      });
    });
  });
});
