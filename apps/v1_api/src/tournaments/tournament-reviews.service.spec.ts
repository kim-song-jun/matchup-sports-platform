/**
 * tournament-reviews.service.spec.ts
 *
 * Contract tests for the tournament awards admin gate (security fix)
 * and the roster-only recipient enforcement.
 * Verifies: non-admin authenticated users get 403 on both listAwards (GET)
 * and setAwards (PUT), support-role admins cannot mutate via setAwards,
 * a legitimate admin can still read/write awards end-to-end, and setAwards
 * rejects recipients/teams that are not in the tournament roster
 * (400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation executed).
 * Forbidden/invalid paths verify "no DB mutation" as behaviour by asserting
 * the Prisma $transaction/deleteMany mocks were not invoked; success paths
 * assert persisted values and the admin audit log record.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { TournamentReviewsService } from './tournament-reviews.service';
import { NotificationsService } from '../notifications/notifications.service';
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';

const ownerAuthUser = {
  id: 'owner-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const supportAuthUser = {
  id: 'support-user-id',
  email: 'support@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
/**
 * 수상 알림 발송 목. 이 스위트는 DB 없이 도는 서비스 단위 테스트라 실제 발송을
 * 태우지 않는다 — "누구에게 몇 번 보냈는가"만 계약으로 고정한다.
 */
const notifications = { emitNotification: jest.fn() } as unknown as NotificationsService;

const plainUser = {
  id: 'plain-user-id',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdminRecord = {
  id: 'owner-admin-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

function awardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'award-1',
    tournamentId: 'tournament-1',
    awardType: 'mvp',
    awardLabel: 'MVP',
    iconKey: 'crown',
    recipientName: '김철수',
    recipientUserId: 'user-kim',
    teamName: '레알마드리드',
    note: null,
    sortOrder: 0,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    tournamentId: 'tournament-1',
    authorUserId: 'plain-user-id',
    teamName: '레알마드리드',
    rating: 5,
    comment: '좋은 대회였어요',
    photoUrls: [],
    hiddenAt: null,
    hiddenReason: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    author: { id: 'plain-user-id', profile: { nickname: '김철수', profileImageUrl: null } },
    ...overrides,
  };
}

/** confirmed 등록 2건 — '레알마드리드'(김철수·이영희), '바르셀로나'(박지성) */
const confirmedRegistrationRows = [
  {
    team: { name: '레알마드리드' },
    players: [
      { userId: 'user-kim', realName: '김철수' },
      { userId: 'user-lee', realName: '이영희' },
    ],
  },
  {
    team: { name: '바르셀로나' },
    players: [{ userId: 'user-park', realName: '박지성' }],
  },
];

describe('TournamentReviewsService — awards admin gate', () => {
  let service: TournamentReviewsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentAward: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    v1TournamentRegistration: { findMany: jest.Mock };
    v1TournamentReview: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    // 알림 목은 스위트 전역이라 테스트마다 초기화하지 않으면 호출 횟수가 누적된다.
    (notifications.emitNotification as jest.Mock).mockClear();
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentAward: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      v1TournamentRegistration: { findMany: jest.fn() },
      v1TournamentReview: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      $transaction: jest.fn(),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentReviewsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TournamentReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAwards (GET) ───────────────────────────────────────────────────

  it('listAwards: non-admin authenticated user → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.listAwards(plainUser, 'tournament-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentAward.findMany).not.toHaveBeenCalled();
  });

  it('listAwards: support admin can read (read-only gate)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    const result = await service.listAwards(supportAuthUser, 'tournament-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'award-1', awardType: 'mvp' });
  });

  it('listAwards: owner admin can read', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAward.findMany.mockResolvedValue([]);

    const result = await service.listAwards(ownerAuthUser, 'tournament-1');

    expect(result).toEqual([]);
  });

  // ─── listMyPendingReviews (GET) ─────────────────────────────────────────

  // `listMyPendingReviews` 는 `status: 'confirmed'` 를 쓰는 19곳 중 **유일하게
  // `tournamentId` 스코프가 없는** 쿼리다 — 사용자의 팀이 확정 등록된 **모든** 대회를 훑는다.
  // 참가팀 백필이 리그 시즌에 `confirmed` 등록을 만들 것이므로 실재하는 경로다.
  //
  // 지금까지 안 보였던 건 `tournament.status = 'completed'` 덕이지만(백필 리그는 draft),
  // 그건 **다른 파일의 가드에 기댄 것**이다 — P0~P3 가 49곳에서 없앤 그 구조.
  it('listMyPendingReviews: 종류 조건을 걸어 리그 시즌이 후기 대기 목록에 들어오지 않는다', async () => {
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);

    await service.listMyPendingReviews(plainUser.id);

    const where = prisma.v1TournamentRegistration.findMany.mock.calls[0][0].where as {
      tournament: Record<string, unknown>;
    };
    // `OR` 이 있는지가 아니라 **그 OR 이 kind 조건인지**를 본다 — 존재만 보면 호출부가
    // 자기 OR 을 쓰는 날 봉쇄가 빠져도 통과한다(#866 에서 같은 지적을 받았다).
    expect(where.tournament.OR).toEqual([{ kind: 'regular_tournament' }, { kind: null }]);
    // 기존 조건도 살아 있어야 한다 — 종류 조건을 넣다 이걸 덮으면 draft·삭제 대회가 샌다.
    expect(where.tournament).toMatchObject({ status: 'completed', deletedAt: null });
  });

  // ─── setAwards (PUT) ────────────────────────────────────────────────────

  it('setAwards: non-admin authenticated user → 403 PERMISSION_DENIED, no data mutated', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.setAwards(plainUser, 'tournament-1', { awards: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Tournament.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: support admin cannot mutate → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.setAwards(supportAuthUser, 'tournament-1', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: 리그 id 는 어워드를 만들지 못한다 — 삭제·생성 모두 일어나지 않는다', async () => {
    // 어워드는 공개 사용자 기록(`public-user-records`)으로 흘러나간다 — 리그 id 로 만들어지면
    // 대회 수상 이력에 섞인다. 404 만 보지 않고 **쓰기가 0회**인지 함께 단언한다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'league-1', deletedAt: null, kind: 'regular_league' }),
    );
    // 봉쇄가 없으면 실제로 성공하도록 채운다.
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());

    await expect(
      service.setAwards(ownerAuthUser, 'league-1', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });

    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.create).not.toHaveBeenCalled();
  });

  it('setAwards: owner admin replaces awards and returns the updated list', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    const result = await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp',
          awardLabel: 'MVP',
          iconKey: 'medal',
          recipientName: '김철수',
          recipientUserId: 'user-kim',
          teamName: '레알마드리드',
        },
      ],
    });

    expect(prisma.v1TournamentAward.deleteMany).toHaveBeenCalledWith({
      where: { tournamentId: 'tournament-1' },
    });
    expect(prisma.v1TournamentAward.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ iconKey: 'medal' }) }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ awardType: 'mvp', recipientName: '김철수' });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.awards_replace',
          targetType: 'tournament',
          targetId: 'tournament-1',
        }),
      }),
    );
  });

  // ─── 수상 알림 (1차 대회 회고: "시상식에 딱 1,2,3등 팀만 남음") ──────────────
  //
  // 실은 통지 문제였다 — 수상자가 저장돼도 본인이 알 방법이 없어서, 자리를 뜬 사람은
  // 자기가 받았다는 사실조차 몰랐다.
  //
  // 이 스위트의 핵심 계약은 **재저장 시 중복 발송 금지**다. setAwards 는 전체 교체
  // (deleteMany + 재생성)라 순진하게 걸면 어드민이 오타 하나 고칠 때마다 같은 사람에게
  // 축하 알림이 다시 간다 — 그건 기능이 아니라 스팸이다.

  it('setAwards: 새로 수상한 사람에게만 알림을 보낸다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', title: '테스트 대회', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.findMany.mockResolvedValueOnce([]); // before: 수상 없음
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp', awardLabel: 'MVP', iconKey: 'medal',
          recipientName: '김철수', recipientUserId: 'user-kim', teamName: '레알마드리드',
        },
      ],
    });

    expect(notifications.emitNotification).toHaveBeenCalledTimes(1);
    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'user-kim',
      'tournament_award_received',
      'tournament-1',
      // 본문에 상 이름이 들어가야 알림만 보고 "무엇을 받았는지"가 전해진다.
      expect.stringContaining('MVP'),
    );
  });

  // 이 스위트에서 가장 중요한 계약.
  it('setAwards: 같은 수상자를 그대로 다시 저장하면 알림을 또 보내지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', title: '테스트 대회', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    // before: 이미 같은 (awardType, recipientUserId) 조합이 저장돼 있다.
    prisma.v1TournamentAward.findMany.mockResolvedValueOnce([
      { ...awardRow(), awardType: 'mvp', recipientUserId: 'user-kim' },
    ]);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp', awardLabel: 'MVP', iconKey: 'medal',
          recipientName: '김철수', recipientUserId: 'user-kim', teamName: '레알마드리드',
        },
      ],
    });

    expect(notifications.emitNotification).not.toHaveBeenCalled();
  });

  it('setAwards: 같은 사람이 다른 상을 새로 받으면 그건 새 수상이라 알린다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', title: '테스트 대회', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.findMany.mockResolvedValueOnce([
      { ...awardRow(), awardType: 'mvp', recipientUserId: 'user-kim' },
    ]);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp', awardLabel: 'MVP', iconKey: 'medal',
          recipientName: '김철수', recipientUserId: 'user-kim', teamName: '레알마드리드',
        },
        {
          awardType: 'top_scorer', awardLabel: '득점왕', iconKey: 'goal',
          recipientName: '김철수', recipientUserId: 'user-kim', teamName: '레알마드리드',
        },
      ],
    });

    expect(notifications.emitNotification).toHaveBeenCalledTimes(1);
    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'user-kim', 'tournament_award_received', 'tournament-1', expect.stringContaining('득점왕'),
    );
  });

  // 감사 evidence: 대회가 아직 completed 로 전환되지 않은 채(정상 운영 흐름 —
  // "시상식 당일 저장 → 나중에 status 전환") 수상을 저장하면, 알림이 "공개됐어요"라고
  // 단정해도 착지 화면(`/tournaments/:id/awards`)은 `NotCompletedNotice`만 보여줘
  // 알림이 약속을 못 지키는 막다른 길이 됐다. 알림 본문이 그 사실을 미리 알려야 한다.
  it('setAwards: 대회가 completed 가 아니면 알림 본문에 "종료 후 확인" 안내를 덧붙인다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({
      id: 'tournament-1',
      title: '테스트 대회',
      status: 'in_progress',
      deletedAt: null,
    });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.findMany.mockResolvedValueOnce([]);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp', awardLabel: 'MVP', iconKey: 'medal',
          recipientName: '김철수', recipientUserId: 'user-kim', teamName: '레알마드리드',
        },
      ],
    });

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'user-kim', 'tournament_award_received', 'tournament-1',
      expect.stringContaining('공식 발표는 대회 종료 후'),
    );
  });

  it('setAwards: 대회가 이미 completed 면 알림 본문에 "종료 후" 안내를 덧붙이지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({
      id: 'tournament-1',
      title: '테스트 대회',
      status: 'completed',
      deletedAt: null,
    });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.findMany.mockResolvedValueOnce([]);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp', awardLabel: 'MVP', iconKey: 'medal',
          recipientName: '김철수', recipientUserId: 'user-kim', teamName: '레알마드리드',
        },
      ],
    });

    const [, , , body] = (notifications.emitNotification as jest.Mock).mock.calls[0];
    expect(body).not.toContain('공식 발표는 대회 종료 후');
  });

  // 감사 evidence(정합성 회귀 방지): 예전엔 제출된 teamName이 이 대회의 다른 confirmed
  // 팀 이름과 문자열이 다르기만 해도 400으로 전체 저장을 거부했다. 그런데 신원의
  // 1차 키는 recipientUserId(계정)이지 teamName 문자열이 아니다 — 이 사람이 이 대회에
  // confirmed 팀 하나에만(레알마드리드) 속해 있으면, 제출된 teamName이 낡았든(팀 개명)
  // 잘못 입력됐든 서버는 **그 사람의 실제 라이브 소속 팀**으로 정규화해 저장해야 한다.
  // (다른 후보와 충돌해 진짜 모호한 경우는 아래 "동일 계정이 두 팀에 걸쳐 있으면" 테스트가
  // 커버한다.)
  it('setAwards: userId가 유일하게 일치하면 제출된 teamName이 달라도 실제 소속 팀으로 정규화해 저장한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp',
          awardLabel: 'MVP',
          recipientName: '김철수', // 실제로는 레알마드리드 소속
          recipientUserId: 'user-kim',
          teamName: '바르셀로나', // 낡았거나 잘못 제출된 값 — 실제 소속이 아니다
        },
      ],
    });

    expect(prisma.v1TournamentAward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientUserId: 'user-kim', teamName: '레알마드리드' }),
      }),
    );
  });

  // 신규: userId만으로 후보가 둘 이상(같은 사람이 이 대회 confirmed 팀 두 곳에 등록된
  // 드문 경우)이면, 그때는 teamName이 진짜 판별자가 된다 — 둘 다 만족하는 후보가
  // 여전히 둘 이상이면 모호하다고 보고 400.
  it('setAwards: 동일 계정이 두 confirmed 팀에 걸쳐 있고 teamName으로도 못 가르면 400', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { team: { name: '레알마드리드' }, players: [{ userId: 'user-kim', realName: '김철수' }] },
      { team: { name: '바르셀로나' }, players: [{ userId: 'user-kim', realName: '김철수' }] },
    ]);

    await expect(
      service.setAwards(ownerAuthUser, 'tournament-1', {
        awards: [
          {
            awardType: 'mvp',
            awardLabel: 'MVP',
            recipientName: '김철수',
            recipientUserId: 'user-kim',
            // teamName 미제출 — award.teamName === null 취급되어 두 후보 모두를 통과시키므로
            // (2차 판별자가 없다) 모호한 채로 남는다.
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: 공백 섞인 수상자·팀명은 trim된 값으로 검증·저장된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp',
          awardLabel: 'MVP',
          recipientName: '  김철수  ',
          recipientUserId: 'user-kim',
          teamName: ' 레알마드리드 ',
        },
      ],
    });

    expect(prisma.v1TournamentAward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientName: '김철수',
          teamName: '레알마드리드',
        }),
      }),
    );
  });

  it('setAwards: unknown tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(
      service.setAwards(ownerAuthUser, 'ghost', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── setAwards 로스터 전용 강제 ─────────────────────────────────────────

  it('setAwards: recipient not in tournament roster → 400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    const attempt = service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        { awardType: 'mvp', awardLabel: 'MVP', recipientName: '외부인', recipientUserId: 'user-external' },
      ],
    });

    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
  });

  // recipientUserId는 유일하게 일치해도, 함께 제출된 recipientName이 그 계정의 실제
  // 명단 실명과 다르면 여전히 거부한다 — userId를 신원의 1차 키로 승격했다고 해서
  // 이름 검증까지 없앤 건 아니다.
  it('setAwards: userId는 일치해도 recipientName이 명단 실명과 다르면 400', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    await expect(
      service.setAwards(ownerAuthUser, 'tournament-1', {
        awards: [
          {
            awardType: 'mvp',
            awardLabel: 'MVP',
            recipientName: '전혀다른이름',
            recipientUserId: 'user-kim',
            teamName: '미참가팀',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
  });

  it('setAwards: roster recipient without teamName passes validation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(
      awardRow({ recipientName: '이영희', recipientUserId: 'user-lee', teamName: '레알마드리드' }),
    );
    prisma.v1TournamentAward.findMany.mockResolvedValue([
      awardRow({ recipientName: '이영희', recipientUserId: 'user-lee', teamName: '레알마드리드' }),
    ]);

    const result = await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [{ awardType: 'mvp', awardLabel: 'MVP', recipientName: '이영희', recipientUserId: 'user-lee' }],
    });

    expect(result[0]).toMatchObject({ recipientName: '이영희', recipientUserId: 'user-lee', teamName: '레알마드리드' });
    expect(prisma.v1TournamentAward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientUserId: 'user-lee', teamName: '레알마드리드' }),
      }),
    );
  });

  it('setAwards: roster is scoped to confirmed registrations of the tournament', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [{ awardType: 'mvp', awardLabel: 'MVP', recipientName: '김철수', recipientUserId: 'user-kim' }],
    });

    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1', status: 'confirmed' },
      }),
    );
  });
});

describe('TournamentReviewsService — review hide moderation', () => {
  let service: TournamentReviewsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1TournamentReview: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1TournamentReview: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      $transaction: jest.fn(),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentReviewsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TournamentReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listReviews (공개) — 숨김 리뷰 제외 ───────────────────────────────

  it('listReviews: where절에 hiddenAt: null이 포함되어 숨김 리뷰가 목록/카운트에서 제외된다', async () => {
    prisma.v1TournamentReview.findMany.mockResolvedValue([reviewRow()]);
    prisma.v1TournamentReview.count.mockResolvedValue(1);

    const result = await service.listReviews('tournament-1');

    expect(prisma.v1TournamentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 'tournament-1', hiddenAt: null }),
      }),
    );
    expect(prisma.v1TournamentReview.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hiddenAt: null }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('hiddenAt');
  });

  // ─── listReviewsAdmin ───────────────────────────────────────────────────

  it('listReviewsAdmin: non-admin authenticated user → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.listReviewsAdmin(plainUser, 'tournament-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.v1TournamentReview.findMany).not.toHaveBeenCalled();
  });

  it('listReviewsAdmin: 숨김 리뷰도 포함해 조회하고 hiddenAt/hiddenReason을 반환한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    const hidden = reviewRow({
      id: 'review-2',
      hiddenAt: new Date('2026-07-13T00:00:00.000Z'),
      hiddenReason: '부적절한 표현',
    });
    prisma.v1TournamentReview.findMany.mockResolvedValue([reviewRow(), hidden]);
    prisma.v1TournamentReview.count.mockResolvedValue(2);

    const result = await service.listReviewsAdmin(supportAuthUser, 'tournament-1');

    expect(prisma.v1TournamentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1' },
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ hiddenAt: null, hiddenReason: null });
    expect(result.items[1]).toMatchObject({
      hiddenAt: '2026-07-13T00:00:00.000Z',
      hiddenReason: '부적절한 표현',
    });
  });

  // ─── hideReview ─────────────────────────────────────────────────────────

  it('hideReview: non-admin authenticated user → 403, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.hideReview(plainUser, 'tournament-1', 'review-1', {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.v1TournamentReview.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hideReview: support admin cannot mutate → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.hideReview(supportAuthUser, 'tournament-1', 'review-1', {}),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hideReview: 다른 대회 소속이거나 존재하지 않는 리뷰 → 404 REVIEW_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);

    await expect(
      service.hideReview(ownerAuthUser, 'tournament-1', 'ghost-review', {}),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });
    expect(prisma.v1TournamentReview.findFirst).toHaveBeenCalledWith({
      where: { id: 'ghost-review', tournamentId: 'tournament-1' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hideReview: owner admin이 리뷰를 숨기고 감사 로그를 남긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(reviewRow());
    prisma.v1TournamentReview.update.mockResolvedValue(
      reviewRow({ hiddenAt: new Date(), hiddenReason: '욕설 포함' }),
    );

    const result = await service.hideReview(ownerAuthUser, 'tournament-1', 'review-1', {
      reason: '욕설 포함',
    });

    expect(result).toEqual({ alreadyHidden: false });
    expect(prisma.v1TournamentReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-1' },
        data: expect.objectContaining({ hiddenReason: '욕설 포함' }),
      }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.review_hide',
          targetType: 'tournament_review',
          targetId: 'review-1',
          reason: '욕설 포함',
        }),
      }),
    );
  });

  it('hideReview: 이미 숨김 상태면 alreadyHidden: true를 반환하고 재-mutation하지 않는다 (멱등)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(
      reviewRow({ hiddenAt: new Date('2026-07-01T00:00:00.000Z'), hiddenReason: '기존 사유' }),
    );

    const result = await service.hideReview(ownerAuthUser, 'tournament-1', 'review-1', {});

    expect(result).toEqual({ alreadyHidden: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentReview.update).not.toHaveBeenCalled();
  });

  // ─── unhideReview ───────────────────────────────────────────────────────

  it('unhideReview: non-admin authenticated user → 403, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.unhideReview(plainUser, 'tournament-1', 'review-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unhideReview: 존재하지 않는 리뷰 → 404 REVIEW_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);

    await expect(
      service.unhideReview(ownerAuthUser, 'tournament-1', 'ghost-review'),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('unhideReview: owner admin이 숨김을 해제하고 감사 로그를 남긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(
      reviewRow({ hiddenAt: new Date('2026-07-01T00:00:00.000Z'), hiddenReason: '기존 사유' }),
    );
    prisma.v1TournamentReview.update.mockResolvedValue(reviewRow());

    const result = await service.unhideReview(ownerAuthUser, 'tournament-1', 'review-1');

    expect(result).toEqual({ alreadyVisible: false });
    expect(prisma.v1TournamentReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'review-1' },
        data: { hiddenAt: null, hiddenReason: null },
      }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.review_unhide',
          targetType: 'tournament_review',
          targetId: 'review-1',
        }),
      }),
    );
  });

  it('unhideReview: 이미 노출 중이면 alreadyVisible: true를 반환하고 재-mutation하지 않는다 (멱등)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(reviewRow({ hiddenAt: null }));

    const result = await service.unhideReview(ownerAuthUser, 'tournament-1', 'review-1');

    expect(result).toEqual({ alreadyVisible: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentReview.update).not.toHaveBeenCalled();
  });
});

/**
 * 트랙 B — 대회 후기 작성 권한을 "대회 신청 버튼을 누른 본인(appliedByUserId)" 에서
 * "참가 확정 팀의 팀장·운영진(owner/manager, active membership)" 으로 확장한 계약.
 * findEligibleTeams()가 v1TournamentRegistration.findMany(team: { memberships: { some: ... } })
 * 경유로 판정하므로, 각 테스트는 registration.findMany 목으로 "내가 owner/manager인 팀의
 * confirmed 등록" 존재 여부를 표현한다.
 */
describe('TournamentReviewsService — 팀 후기 권한 (팀장·운영진 manager+)', () => {
  let service: TournamentReviewsService;
  let prisma: {
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentRegistration: { findMany: jest.Mock; findFirst: jest.Mock };
    v1TournamentReview: { findFirst: jest.Mock; create: jest.Mock };
    v1UploadAsset: { findMany: jest.Mock };
  };

  const completedTournament = { id: 'tournament-1', status: 'completed', deletedAt: null };

  beforeEach(async () => {
    prisma = {
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentRegistration: { findMany: jest.fn(), findFirst: jest.fn() },
      v1TournamentReview: { findFirst: jest.fn(), create: jest.fn() },
      v1UploadAsset: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentReviewsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TournamentReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // 통합 백필(R3) 이후 리그 id 가 이 조회를 통과할 수 있게 됐다. 리뷰 생성은 **쓰기**이고,
  // 만들어진 리뷰는 공개 조회(`listReviews`)로 그대로 나간다.
  //
  // **오늘 당장 뚫리지는 않는다** — 이 경로는 `status === 'completed'` 를 요구하는데 백필
  // 리그는 `draft` 라 400 에서 걸린다. 다만 운영자가 `changeStatus` 로 상태를 바꾸면 그
  // 게이트가 사라지고, 그 전이는 아직 종류 조건이 없다(감사 운영자 11건 중 하나).
  // **이 지점은 P2 의 `changeStatus` 차단과 함께라야 닫힌다.**
  it('submitReview: 리그 id 로는 열리지 않는다 (상태 게이트보다 먼저 막힌다)', async () => {
    // status 를 completed 로 줘서 **상태 게이트를 무력화**한다 — 그래야 404 가 종류 조건
    // 때문임이 증명된다. 상태로 막히는 걸 보고 "막혔다"고 하면 필터를 안 걸어도 통과한다.
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ ...completedTournament, id: 'league-1', kind: 'regular_league' }),
    );
    await expect(
      service.submitReview('league-1', plainUser, { rating: 5, comment: '좋은 대회였어요' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  // (a) manager가 후기 작성 성공
  it('submitReview: 팀장이 아닌 매니저(manager)도 참가 확정 팀 몫으로 후기를 작성할 수 있다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null); // 중복 없음
    prisma.v1TournamentReview.create.mockResolvedValue(
      reviewRow({ authorUserId: 'manager-user-id', teamName: '레알마드리드' }),
    );

    const result = await service.submitReview(
      'tournament-1',
      { ...plainUser, id: 'manager-user-id' },
      { rating: 5, comment: '좋은 대회였어요' },
    );

    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          status: 'confirmed',
          team: expect.objectContaining({
            memberships: {
              some: { userId: 'manager-user-id', status: 'active', role: { in: ['owner', 'manager'] } },
            },
          }),
        }),
      }),
    );
    expect(prisma.v1TournamentReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tournamentId: 'tournament-1',
          authorUserId: 'manager-user-id',
          teamId: 'team-1',
          teamName: '레알마드리드',
        }),
      }),
    );
    expect(result.teamName).toBe('레알마드리드');
  });

  // 감사 evidence: photoUrls 는 형식·소유 검증이 전혀 없어 임의의 외부 URL이나 남이
  // 올린 업로드 URL을 그대로 저장해 공개 후기 화면(비로그인 방문자 포함)에 노출할 수
  // 있었다. tournament-fixture-videos.service.ts 의 assertOwnUploadedVideo 와 동일한
  // 위협 모델을 후기 사진에도 적용했는지 직접 검증한다.
  it('submitReview: 내가 업로드한 이미지 URL 은 photoUrls 로 그대로 저장된다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);
    prisma.v1UploadAsset.findMany.mockResolvedValue([
      { url: '/uploads/2026/08/mine.jpg', ownerUserId: 'manager-user-id', kind: 'image' },
    ]);
    prisma.v1TournamentReview.create.mockResolvedValue(
      reviewRow({
        authorUserId: 'manager-user-id',
        teamName: '레알마드리드',
        photoUrls: ['/uploads/2026/08/mine.jpg'],
      }),
    );

    await service.submitReview(
      'tournament-1',
      { ...plainUser, id: 'manager-user-id' },
      { rating: 5, photoUrls: ['/uploads/2026/08/mine.jpg'] },
    );

    expect(prisma.v1UploadAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { url: { in: ['/uploads/2026/08/mine.jpg'] } } }),
    );
    expect(prisma.v1TournamentReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ photoUrls: ['/uploads/2026/08/mine.jpg'] }),
      }),
    );
  });

  it('submitReview: 남이 올린 업로드 URL 을 photoUrls 에 넣으면 400, DB 무변경', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);
    // 남의 자산(ownerUserId 불일치)
    prisma.v1UploadAsset.findMany.mockResolvedValue([
      { url: '/uploads/2026/08/someone-else.jpg', ownerUserId: 'other-user-id', kind: 'image' },
    ]);

    await expect(
      service.submitReview(
        'tournament-1',
        { ...plainUser, id: 'manager-user-id' },
        { rating: 5, photoUrls: ['/uploads/2026/08/someone-else.jpg'] },
      ),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_PHOTO_UPLOAD_NOT_FOUND' } });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  it('submitReview: 원장에 없는 임의의 외부 URL 을 photoUrls 에 넣으면 400, DB 무변경', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);
    prisma.v1UploadAsset.findMany.mockResolvedValue([]); // 등록된 적 없는 URL

    await expect(
      service.submitReview(
        'tournament-1',
        { ...plainUser, id: 'manager-user-id' },
        { rating: 5, photoUrls: ['https://attacker.example/nsfw.gif'] },
      ),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_PHOTO_UPLOAD_NOT_FOUND' } });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  // (b) 중복 판정 단위는 팀이 아니라 사람이다 (2026-08-17)
  //     예전엔 팀당 1건이라 팀장이 먼저 쓰면 운영진이 막혔다. 경기 후기는 이미 사람 기준이라
  //     같은 성격의 평가가 두 도메인에서 다르게 동작했다.
  it('submitReview: 같은 팀의 다른 운영진이 이미 썼어도 내 몫은 쓸 수 있다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    // 사람 기준 조회라 "내가 쓴 것"이 없으면 null 이 돌아온다.
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);
    prisma.v1TournamentReview.create.mockResolvedValue(
      reviewRow({ authorUserId: 'manager-user-id', teamId: 'team-1', teamName: '레알마드리드' }),
    );

    await service.submitReview('tournament-1', { ...plainUser, id: 'manager-user-id' }, { rating: 4 });

    expect(prisma.v1TournamentReview.create).toHaveBeenCalled();
    // mock 은 where 를 무시하므로 조회 조건을 직접 단언하지 않으면 팀 기준으로 되돌려도 통과한다.
    expect(prisma.v1TournamentReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1', authorUserId: 'manager-user-id' },
      }),
    );
  });

  it('submitReview: 내가 이미 쓴 대회면 ALREADY_REVIEWED, 저장하지 않는다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(
      reviewRow({ authorUserId: 'manager-user-id', teamId: 'team-1', teamName: '레알마드리드' }),
    );

    await expect(
      service.submitReview('tournament-1', { ...plainUser, id: 'manager-user-id' }, { rating: 4 }),
    ).rejects.toMatchObject({ response: { code: 'ALREADY_REVIEWED' } });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  // (c) 일반 member는 403
  it('submitReview: 참가 확정 팀 소속이라도 일반 member는 403 NOT_PARTICIPANT', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    // member는 owner/manager 조건에 걸리지 않으므로 findMany where에 매칭되는 등록이 없다.
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);

    await expect(
      service.submitReview(
        'tournament-1',
        { ...plainUser, id: 'member-user-id' },
        { rating: 3 },
      ),
    ).rejects.toMatchObject({ response: { code: 'NOT_PARTICIPANT' } });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  // (e) 두 팀의 팀장·운영진을 겸하고 두 팀 모두 참가 확정 — teamId 없이 제출하면 400
  it('submitReview: 2개 팀 모두 참가 확정인 사용자가 teamId 없이 제출하면 400 TEAM_SELECTION_REQUIRED + details.teams', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
      { teamId: 'team-2', team: { name: '바르셀로나' } },
    ]);

    await expect(
      service.submitReview(
        'tournament-1',
        { ...plainUser, id: 'dual-manager-user-id' },
        { rating: 5 },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'TEAM_SELECTION_REQUIRED',
        details: {
          teams: [
            { teamId: 'team-1', teamName: '레알마드리드' },
            { teamId: 'team-2', teamName: '바르셀로나' },
          ],
        },
      },
    });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  // (f) 위와 같은 사용자가 teamId를 명시하면 그 팀 몫으로 정상 저장된다
  it('submitReview: 2개 팀 모두 참가 확정인 사용자가 teamId를 지정하면 그 팀으로 저장한다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
      { teamId: 'team-2', team: { name: '바르셀로나' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);
    prisma.v1TournamentReview.create.mockResolvedValue(
      reviewRow({ authorUserId: 'dual-manager-user-id', teamId: 'team-2', teamName: '바르셀로나' }),
    );

    const result = await service.submitReview(
      'tournament-1',
      { ...plainUser, id: 'dual-manager-user-id' },
      { rating: 5, teamId: 'team-2' },
    );

    expect(prisma.v1TournamentReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: 'team-2', teamName: '바르셀로나' }),
      }),
    );
    expect(result.teamName).toBe('바르셀로나');
  });

  // (g) 자격 없는 teamId를 지정하면 403 (다른 팀의 teamId를 끼워 넣는 시도 방어)
  it('submitReview: 자격 목록에 없는 teamId를 지정하면 403 NOT_PARTICIPANT', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(completedTournament);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
      { teamId: 'team-2', team: { name: '바르셀로나' } },
    ]);

    await expect(
      service.submitReview(
        'tournament-1',
        { ...plainUser, id: 'dual-manager-user-id' },
        { rating: 5, teamId: 'team-999-not-mine' },
      ),
    ).rejects.toMatchObject({ response: { code: 'NOT_PARTICIPANT' } });
    expect(prisma.v1TournamentReview.create).not.toHaveBeenCalled();
  });

  // (d) 대회 후기는 팀당 1건이 아니라 사람당 1건이다.
  //
  // 이 두 테스트는 원래 반대 계약("팀장이 쓴 후기를 같은 팀 운영진 조회에도 반환한다")을
  // 박제하고 있었다. submitReview 의 중복 검사와 listMyPendingReviews 는 2026-08-17 에
  // 이미 사람(authorUserId) 기준으로 바뀌었는데 getMyReview 만 팀 기준 OR fallback 을
  // 남겨서, 팀장이 먼저 쓰면 같은 팀의 두 번째 운영진 화면이 '이미 작성함'으로 잠기고
  // 그 사람은 후기를 영영 못 쓰게 됐다 — 즉 이 테스트들이 결함 쪽을 지키고 있었다.
  // 단언만 뒤집으면 이름이 옛 정책을 계속 주장하므로 의도까지 새 계약으로 다시 쓴다.
  it('getMyReview: 같은 팀이라도 남이 쓴 후기는 내 후기로 반환하지 않는다', async () => {
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(null);

    const result = await service.getMyReview('tournament-1', 'manager-user-id');

    // 팀 기준 OR fallback 이 사라졌다 — 조회 조건은 오직 '내가 쓴 것'이다.
    expect(prisma.v1TournamentReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1', authorUserId: 'manager-user-id' },
      }),
    );
    // 팀장이 쓴 후기가 DB 에 있어도(findFirst 가 authorUserId 로 걸러 null 을 준다)
    // 두 번째 운영진에게는 '아직 안 씀'으로 보여야 작성 화면이 열린다.
    expect(result).toBeNull();
  });

  it('getMyReview: 내가 쓴 후기는 그대로 반환한다', async () => {
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { teamId: 'team-1', team: { name: '레알마드리드' } },
    ]);
    prisma.v1TournamentReview.findFirst.mockResolvedValue(
      reviewRow({ id: 'review-9', authorUserId: 'manager-user-id', teamId: 'team-1', rating: 5 }),
    );

    const result = await service.getMyReview('tournament-1', 'manager-user-id');

    expect(result).toMatchObject({ id: 'review-9', rating: 5 });
  });
});
