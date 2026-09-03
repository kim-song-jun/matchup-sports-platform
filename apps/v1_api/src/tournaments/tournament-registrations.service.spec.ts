/**
 * tournament-registrations.service.spec.ts
 *
 * Contract tests for the team-unit registration state machine: manager+ gate,
 * tournament open/deadline guards, submit agreements + payment-method rules,
 * and cancel-request transitions. Asserts observable behaviour only.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';

const manager = { id: 'manager-user', email: 'm@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function openTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    title: '테스트대회',
    sportId: 'sport-futsal',
    status: 'open',
    entryFee: 120000,
    bankName: '국민은행',
    bankAccount: '123-456',
    bankHolder: '팀밋',
    teamCount: 8,
    registrationDeadlineAt: null,
    deletedAt: null,
    ...overrides,
  };
}
function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1', tournamentId: 'tournament-1', teamId: 'team-1', appliedByUserId: 'manager-user',
    status: 'draft', depositorName: null, agreedRules: false, agreedPrivacy: false, agreedRefund: false,
    agreedMediaConsent: false, confirmedAt: null, rosterLockedAt: null, cancelRequestedAt: null,
    cancelPreviousStatus: null, cancelReason: null,
    createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z'), ...overrides,
  };
}
function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1', registrationId: 'reg-1', method: 'bank_transfer', provider: null, providerTxId: null,
    amount: 120000, status: 'ready', paidAt: null, cancelledAt: null, refundedAt: null,
    confirmedByAdminUserId: null, rawWebhookRef: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}
const RULES_ID = '11111111-1111-4111-8111-111111111111';
const PRIVACY_ID = '22222222-2222-4222-8222-222222222222';
const REFUND_ID = '33333333-3333-4333-8333-333333333333';
const MEDIA_ID = '44444444-4444-4444-8444-444444444444';
const RECORD_DISCLOSURE_ID = '55555555-5555-4555-8555-555555555555';
const validSubmit = {
  termsDocumentIds: [RULES_ID, PRIVACY_ID, REFUND_ID],
  paymentMethod: 'bank_transfer' as const,
  depositorName: '홍길동',
  agreedRules: true,
  agreedPrivacy: true,
  agreedRefund: true,
};

describe('TournamentRegistrationsService', () => {
  let service: TournamentRegistrationsService;
  let prisma: {
    v1TeamMembership: { findFirst: jest.Mock };
    v1User: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentRegistration: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; count: jest.Mock };
    v1TournamentPayment: { upsert: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    v1TournamentPlayer: { count: jest.Mock; groupBy: jest.Mock; findMany: jest.Mock };
    // 쓰기 메서드를 일부러 두지 않는다 -- 구현이 기록 공개 상태를 쓰려 하면 즉시 깨져야 한다.
    v1UserRecordConsent: { findMany: jest.Mock };
    v1UserProfile: { updateMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };
  let managedTerms: {
    assertTournamentAcceptances: jest.Mock;
    recordTournamentDecisions: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1TeamMembership: { findFirst: jest.fn() },
      // 기본은 "본인인증을 마친 신청자" — 제출 게이트의 정상 경로.
      // 미인증 케이스는 개별 테스트에서 phoneVerifiedAt: null 로 덮어쓴다.
      v1User: {
        findUnique: jest.fn().mockResolvedValue({ phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z') }),
      },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentRegistration: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      v1TournamentPayment: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      v1TournamentPlayer: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      v1UserRecordConsent: { findMany: jest.fn().mockResolvedValue([]) },
      v1UserProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
      // R17-005 / R16-001 / R17-006: $queryRaw is called inside transactions for
      // SELECT FOR UPDATE; a no-op mock is sufficient for unit tests.
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));
    // 기본: 매니저 권한 통과
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      role: 'manager',
      team: { sportId: 'sport-futsal' },
    });

    notifications = {
      emitNotification: jest.fn().mockResolvedValue(undefined),
      // 실제 구현은 resolver 를 즉시 실행하고 에러를 삼킨다. 테스트에서는 resolver 를
      // 붙잡아 두고 개별 테스트가 직접 await 해서 "누구를 고르는가"를 검증한다.
      emitToManyDeferred: jest.fn(),
    };
    managedTerms = {
      assertTournamentAcceptances: jest.fn().mockImplementation(async (documentIds: string[]) => {
        if (![RULES_ID, PRIVACY_ID, REFUND_ID].every((id) => documentIds.includes(id))) {
          throw new BadRequestException({ code: 'AGREEMENTS_REQUIRED' });
        }
        const acceptedCodes = new Set(['tournament_rules', 'tournament_privacy', 'tournament_refund']);
        if (documentIds.includes(MEDIA_ID)) acceptedCodes.add('tournament_media');
        return {
          acceptedDocumentIds: documentIds,
          notAcceptedDocumentIds: documentIds.includes(MEDIA_ID) ? [] : [MEDIA_ID],
          acceptedCodes,
        };
      }),
      recordTournamentDecisions: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentRegistrationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: ManagedTermsRuntimeService, useValue: managedTerms },
      ],
    }).compile();
    service = module.get(TournamentRegistrationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 통합 표면 개방 (D7 — 리그도 같은 신청 스택을 쓴다) ──────────────────────
  // 예전엔 이 자리가 **봉쇄**였다. 통합 백필(R3)이 `v1_tournaments` 에 정규 리그 시즌을
  // 만들면서 리그 id 가 이 조회들을 통과하기 시작했고(#863 이 공개 경로에서 실측), 등록
  // 경로는 **쓰기**라 통과하면 리그 행에 실제 참가 신청이 붙기 때문이었다.
  //
  // **D7 이 바로 그것을 원한다** — 정본은 리그 참가도 신청제이고 대회와 같은 스택을 쓴다.
  // 그래서 종류 게이트를 열었다. 아래 테스트들은 그 반대 방향을 고정한다: 리그가 실제로
  // 통과하는지, 그리고 **종류 말고 남은 게이트들은 그대로인지**(상태·마감·권한·경합).
  describe('통합 표면 개방', () => {
    it('create: 리그 id 도 열린다 — 종류 게이트를 지나 다음 게이트까지 간다', async () => {
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(openTournament({ kind: 'regular_league' })),
      );
      prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
      // 404 로 끝나면 종류에서 막힌 것이다. **팀 권한 403 까지 도달**해야 지났다는 증거가 된다
      // — 통과를 "에러가 안 났다" 로 보면 다음 게이트에서 막힌 것과 구분할 수 없다.
      await expect(service.create(manager, 'league-1', { teamId: 'team-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('create: 대회 id 와 kind=null(R1 이전 행)도 그대로 열린다', async () => {
      // 리그만 열고 대회를 닫는 회귀를 막는다 — 셋 다 같은 자리를 지나야 한다.
      for (const kind of ['regular_tournament', null]) {
        prisma.v1Tournament.findFirst.mockImplementation(kindAwareFindFirst(openTournament({ kind })));
        prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
        await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toThrow(
          ForbiddenException,
        );
      }
    });

    it('create: 없는 id 는 여전히 404 — 조회 자체가 사라진 것은 아니다', async () => {
      // 종류 조건을 넓힌 것이지 조회를 없앤 것이 아니다. 이게 없으면 위 두 테스트는
      // "`findFirst` 가 뭘 주든 통과" 와 구분되지 않는다.
      prisma.v1Tournament.findFirst.mockImplementation(kindAwareFindFirst(null));
      await expect(service.create(manager, 'missing-1', { teamId: 'team-1' })).rejects.toMatchObject({
        response: { code: 'TOURNAMENT_NOT_FOUND' },
      });
    });

    // `submit` 은 트랜잭션 **밖**(loadOpenTournament)과 **안**(TOCTOU 재검증) 두 곳에서
    // 대회를 읽는다. 종류 게이트는 열렸지만 **이 재검증 자체는 그대로 필요하다** — 두 조회
    // 사이에 대회가 닫히면(운영자가 마감) 그 틈으로 신청이 들어간다. 예전엔 이 자리를
    // "리그 행으로 바뀌는" 상황으로 태웠는데, 이제 그건 막을 이유가 아니라서 **상태가
    // 바뀌는** 상황으로 태운다. 안 그러면 안쪽 가드가 조건 없이 남고 그 사실이 밖에서
    // 드러나지 않는다(밖에서 이미 막히니 겉보기엔 닫혀 보인다).
    it('submit: 트랜잭션 안 재검증이 그 사이 닫힌 대회를 막는다', async () => {
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      prisma.v1Tournament.findFirst
        // 바깥 조회: 신청 받는 중 → loadOpenTournament 통과
        .mockImplementationOnce(kindAwareFindFirst(openTournament({ kind: 'regular_tournament' })))
        // 트랜잭션 안: 같은 id 가 이미 마감돼 있다
        .mockImplementationOnce(
          kindAwareFindFirst(openTournament({ kind: 'regular_tournament', status: 'closed' })),
        );

      await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
        response: { code: 'TOURNAMENT_NOT_OPEN' },
      });
      expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
      expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
    });

    it('submit: 리그 거울도 제출까지 간다 — 정원 8 에 막히지 않는다', async () => {
      // 거울의 `teamCount` 는 스키마 기본값 8 이라, 정원을 끄지 않으면 9번째 팀부터
      // 409 로 막힌다. 이 테스트가 그 자리를 지킨다.
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(openTournament({ kind: 'regular_league', teamCount: 8 })),
      );
      prisma.v1TournamentRegistration.count.mockResolvedValue(20);
      prisma.v1TournamentRegistration.update.mockResolvedValue(
        registrationRow({ status: 'awaiting_payment' }),
      );
      prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

      await service.submit(manager, 'league-1', 'reg-1', validSubmit);
      // **정원 초과 상태(20 >= 8)에서 실제로 상태가 바뀌었는지**까지 본다 — 호출 여부만
      // 보면 정원 검사가 되살아나도 그 전에 이미 불린 호출로 green 이 될 수 있다.
      expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'awaiting_payment' }) }),
      );
    });

    it('리그는 정원 COUNT 자체를 날리지 않는다 — 결과를 안 쓸 쿼리다', async () => {
      // 정원이 꺼진 것을 "409 가 안 난다" 로만 보면, COUNT 를 계속 날리면서 결과만 버리는
      // 구현과 구분되지 않는다. 호출 자체가 없어야 한다(Copilot 리뷰 지적).
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(openTournament({ kind: 'regular_league', teamCount: 8 })),
      );
      prisma.v1TournamentRegistration.update.mockResolvedValue(
        registrationRow({ status: 'awaiting_payment' }),
      );
      prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
      prisma.v1TournamentRegistration.count.mockClear();

      await service.submit(manager, 'league-1', 'reg-1', validSubmit);
      expect(prisma.v1TournamentRegistration.count).not.toHaveBeenCalled();
    });

    it('대회는 정원 COUNT 를 그대로 날린다 — 리그만 끈 것이지 기능을 지운 게 아니다', async () => {
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(openTournament({ kind: 'regular_tournament', teamCount: 8 })),
      );
      prisma.v1TournamentRegistration.update.mockResolvedValue(
        registrationRow({ status: 'awaiting_payment' }),
      );
      prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
      prisma.v1TournamentRegistration.count.mockClear();
      prisma.v1TournamentRegistration.count.mockResolvedValue(0);

      await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);
      expect(prisma.v1TournamentRegistration.count).toHaveBeenCalled();
    });

    it('내 신청 입금 안내: 리그도 입금 정보를 함께 받는다', async () => {
      // 예전엔 이 조회를 막았다 — 리그 백필 행의 계좌 필드가 채워지면 그대로 새기 때문이다.
      // D7 은 리그도 참가비를 받을 수 있는 구조이므로(거울의 `entryFee` 기본값이 0 이라
      // 지금은 무료지만) 조회를 막지 않고, **운영자가 채운 값만** 나가게 둔다.
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(openTournament({ kind: 'regular_league' })),
      );
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([
        { ...registrationRow({ status: 'awaiting_payment' }), payment: paymentRow(), team: null },
      ]);
      const rows = await service.getMyRegistrations(manager, 'league-1');
      expect(JSON.stringify(rows)).toContain('국민은행');
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  it('create: non-manager → 403', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toThrow(ForbiddenException);
  });

  it('create: tournament not open → 409 TOURNAMENT_NOT_OPEN', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ status: 'draft' }));
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_OPEN' },
    });
  });

  it('create: deadline passed → 409 REGISTRATION_DEADLINE_PASSED', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ registrationDeadlineAt: new Date('2000-01-01') }));
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'REGISTRATION_DEADLINE_PASSED' },
    });
  });

  it('create: already registered (active) → returns existing registration for managed team', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue({
      method: 'bank_transfer', status: 'paid', amount: 120000, paidAt: new Date('2026-06-14T01:00:00Z'),
      createdAt: new Date('2026-06-14T00:00:00Z'),
    });
    prisma.v1TournamentPlayer.count.mockResolvedValue(4);

    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).resolves.toMatchObject({
      id: 'reg-1',
      status: 'confirmed',
      playerCount: 4,
      payment: { method: 'bank_transfer', status: 'paid', amount: 120000 },
    });
  });

  it('create: manager + open + no existing → draft', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.create.mockResolvedValue(registrationRow());
    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });
    expect(result).toMatchObject({ id: 'reg-1', status: 'draft', playerCount: 0 });
  });

  it('create: managed team belongs to another sport → 409 TEAM_SPORT_MISMATCH', async () => {
    // Given: a futsal tournament and a running team managed by the caller.
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      role: 'manager',
      team: { sportId: 'sport-running' },
    });
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.create.mockResolvedValue(registrationRow());

    // When / Then: the registration boundary rejects the cross-sport team.
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'TEAM_SPORT_MISMATCH' },
    });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
  });

  it('create: capacity full from confirmed plus payment-stage registrations → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);

    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
  });

  it('create: P2002 after race returns the team-scoped registration when it now exists', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tournament_id', 'team_id'] },
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(registrationRow({ id: 'race-reg-1' }));
    prisma.v1TournamentRegistration.create.mockRejectedValue(p2002);
    prisma.v1TournamentPlayer.count.mockResolvedValue(1);

    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });

    expect(result).toMatchObject({ id: 'race-reg-1', status: 'draft', playerCount: 1 });
  });

  it('create: P2002 without team-scoped row reports unique scope mismatch', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tournament_id', 'applied_by_user_id'] },
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.create.mockRejectedValue(p2002);

    await expect(service.create(manager, 'tournament-1', { teamId: 'team-2' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_REGISTRATION_UNIQUE_SCOPE_MISMATCH' },
    });
  });

  it('create: existing draft → resumes same draft instead of ALREADY_REGISTERED', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ id: 'draft-reg-1' }));
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);

    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });

    expect(result).toMatchObject({ id: 'draft-reg-1', status: 'draft', playerCount: 2 });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('create: reactivates a previously cancelled registration (unique constraint) → draft', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'draft' }));
    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });
    expect(result).toMatchObject({ status: 'draft' });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
  });

  // 감사 finding(reg-confirm-reapply-state-machine #2/#3): 취소 후 재신청은 완전히 새로운
  // 사이클인데, 되살아난 draft가 이전 사이클(확정→잠금→취소)의 흔적을 그대로 물려받아
  // (a) 새 신청인데 명단이 잠긴 채 시작하고 (b) 임시저장인데 확정일이 함께 표시됐다.
  // 이전 status 값 하나만 보는 위 테스트는 이 회귀를 못 잡는다 — 취소된 신청건이 실제로
  // 그 사이클을 거쳤다면(확정→명단잠금→마감예외부여→취소) 4개 필드가 전부 값을 갖고
  // 있는 상태이고, update() 호출 인자가 그 4개를 명시적으로 null 로 되돌리는지를 직접 봐야 한다.
  it('create: 재활성화된 신청은 rosterLockedAt/rosterDeadlineOverrideAt/confirmedAt/confirmedByAdminUserId를 모두 null로 초기화한다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({
        status: 'cancelled',
        // 취소 전 실제로 확정 → 명단잠금 → 마감예외 부여까지 거쳤던 신청건.
        confirmedAt: new Date('2026-06-01T00:00:00Z'),
        confirmedByAdminUserId: 'admin-1',
        rosterLockedAt: new Date('2026-06-05T00:00:00Z'),
        rosterDeadlineOverrideAt: new Date('2026-06-10T00:00:00Z'),
      }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'draft' }));

    await service.create(manager, 'tournament-1', { teamId: 'team-1' });

    const call = prisma.v1TournamentRegistration.update.mock.calls[0][0];
    expect(call.data.status).toBe('draft');
    expect(call.data.rosterLockedAt).toBeNull();
    expect(call.data.rosterDeadlineOverrideAt).toBeNull();
    expect(call.data.confirmedAt).toBeNull();
    expect(call.data.confirmedByAdminUserId).toBeNull();
  });

  // ─── submit ───────────────────────────────────────────────────────────────────

  describe('참가비 0원이면 입금 단계를 건너뛴다 (Task 164 BE-4)', () => {
    function arrangeSubmit(entryFee: number) {
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(openTournament({ kind: 'regular_tournament', entryFee })),
      );
      prisma.v1TournamentRegistration.update.mockImplementation(
        async (args: { data: { status: string } }) => registrationRow({ status: args.data.status }),
      );
      prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
    }

    it('0원: 등록은 payment_checking · 결제는 paid 로 곧바로 간다 — 확인할 입금이 없다', async () => {
      arrangeSubmit(0);
      await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

      // 착지 상태는 `confirmPayment` 가 만드는 것과 **같아야** 한다. 다른 상태로 보내면
      // 그 뒤의 취소·환불·목록 필터가 0원 건만 다르게 다루게 된다.
      expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'payment_checking' }) }),
      );
      const upsert = prisma.v1TournamentPayment.upsert.mock.calls[0][0] as {
        create: { status: string; paidAt: Date | null };
        update: { status: string; paidAt: Date | null };
      };
      expect(upsert.create.status).toBe('paid');
      expect(upsert.update.status).toBe('paid');
      // **`update` 쪽도 본다.** 결제 레코드가 이미 있는 재제출에서는 `create` 가 아니라
      // 이쪽이 쓰인다 — `create` 만 단언하면 `update` 에서 `paidAt` 이 빠지는 회귀를
      // 못 잡고, 그 결과는 "paid 인데 결제 시각이 null" 이다(Copilot 리뷰 지적).
      expect(upsert.create.paidAt).toBeInstanceOf(Date);
      expect(upsert.update.paidAt).toBeInstanceOf(Date);
    });

    it('유료: 지금까지처럼 awaiting_payment 로 간다 — 리그 편의가 대회 회귀가 되면 안 된다', async () => {
      arrangeSubmit(120000);
      await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

      expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'awaiting_payment' }) }),
      );
      const upsert = prisma.v1TournamentPayment.upsert.mock.calls[0][0] as {
        create: { status: string; paidAt: Date | null };
        update: { status: string; paidAt: Date | null };
      };
      expect(upsert.create.status).toBe('ready');
      expect(upsert.update.status).toBe('ready');
      // 낸 적 없는 돈에 결제 시각이 찍히면 정산·환불이 그것을 근거로 삼는다. 양쪽 다 본다.
      // `null` 이다(미설정이 아니라 **명시적으로 비움**) — 재제출에서 옛 결제의 시각이
      // 남아 있으면 안 되기 때문이다.
      expect(upsert.create.paidAt).toBeNull();
      expect(upsert.update.paidAt).toBeNull();
    });
  });

  it('submit: 본인인증을 안 한 신청자는 403 PHONE_NOT_VERIFIED 로 막고 약관 검증까지 가지 않는다', async () => {
    prisma.v1User.findUnique.mockResolvedValue({ phoneVerifiedAt: null });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());

    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'PHONE_NOT_VERIFIED' },
    });
    expect(managedTerms.assertTournamentAcceptances).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('submit: 인증 강제가 꺼진 환경에서는 미인증이어도 제출을 막지 않는다', async () => {
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'true';
    try {
      prisma.v1User.findUnique.mockResolvedValue({ phoneVerifiedAt: null });
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));

      // 인증이 아니라 그 다음 가드(draft 아님)에서 걸려야 한다 = 인증 게이트를 통과했다는 뜻
      await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
        response: { code: 'REGISTRATION_NOT_DRAFT' },
      });
    } finally {
      delete process.env.V1_PHONE_VERIFICATION_DISABLED;
    }
  });

  it('submit: not draft → 409 REGISTRATION_NOT_DRAFT', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_DRAFT' },
    });
  });

  it('submit: missing agreements → 400 AGREEMENTS_REQUIRED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    await expect(
      service.submit(manager, 'tournament-1', 'reg-1', {
        ...validSubmit,
        termsDocumentIds: [RULES_ID, PRIVACY_ID],
        agreedRefund: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'AGREEMENTS_REQUIRED' } });
  });

  it('submit: 0원에 공백만 있는 입금자명은 null 로 저장한다 — 빈 문자열은 "이름이 있다"로 읽힌다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst(openTournament({ kind: 'regular_tournament', entryFee: 0 })),
    );
    prisma.v1TournamentRegistration.update.mockImplementation(
      async (args: { data: { status: string } }) => registrationRow({ status: args.data.status }),
    );
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    await service.submit(manager, 'tournament-1', 'reg-1', { ...validSubmit, depositorName: '   ' });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ depositorName: null }) }),
    );
  });

  it('submit: 유료 bank_transfer 에 입금자명이 없으면 400 DEPOSITOR_NAME_REQUIRED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    // 이 가드는 이제 **대회를 읽은 뒤** 돈다(`entryFee` 를 알아야 하므로) — 그 전엔
    // 대회 fake 없이도 통과했다. 순서가 바뀌었다는 사실 자체가 여기 드러난다.
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst(openTournament({ kind: 'regular_tournament', entryFee: 120000 })),
    );
    await expect(
      service.submit(manager, 'tournament-1', 'reg-1', { ...validSubmit, depositorName: '   ' }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSITOR_NAME_REQUIRED' } });
  });

  it('submit: 0원이면 입금자명 없이도 제출된다 — 낼 돈이 없는데 입금자를 물을 이유가 없다', async () => {
    // 화면이 안 물어도 옛 클라이언트·API 직접 호출은 그대로 걸렸다. 정본 §4 "스텝 최소" 는
    // 화면이 아니라 **계약**의 문제다.
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    // **무료 대회**로 태운다. 무료 처리는 종류와 무관한 로직이고, 이 브랜치(dev 기준)는
    // 아직 등록 스택이 리그를 안 보므로(#984 의 표면 확대 이전) 리그 행은 여기까지 오지도
    // 못한다 — 그걸로 쓰면 이 스펙은 무료 경로가 아니라 표면 게이트를 시험하게 된다.
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst(openTournament({ kind: 'regular_tournament', entryFee: 0 })),
    );
    prisma.v1TournamentRegistration.update.mockImplementation(
      async (args: { data: { status: string } }) => registrationRow({ status: args.data.status }),
    );
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    // **`undefined` 로 보낸다** — 공백 문자열(`'   '`)로 쓰면 `.trim()` 이 그냥 동작해서
    // non-null 단언이 깨지는 자리를 못 잡는다(Copilot 리뷰가 그 구멍을 짚었다).
    const { depositorName: _omitted, ...withoutDepositor } = validSubmit;
    await service.submit(manager, 'tournament-1', 'reg-1', withoutDepositor as typeof validSubmit);
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'payment_checking', depositorName: null }),
      }),
    );
  });

  it('submit: paid bank transfer without account instructions is rejected before the payment clock starts', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(
      openTournament({ bankName: null, bankAccount: null, bankHolder: null }),
    );

    await expect(
      service.submit(manager, 'tournament-1', 'reg-1', validSubmit),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_PAYMENT_INSTRUCTIONS_MISSING' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
  });

  it('submit: draft team no longer matches the tournament sport → 409 TEAM_SPORT_MISMATCH', async () => {
    // Given: a draft registration whose managed team belongs to a different sport.
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      role: 'manager',
      team: { sportId: 'sport-running' },
    });

    // When / Then: submission rechecks the current team and tournament contract.
    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'TEAM_SPORT_MISMATCH' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
  });

  it('submit: valid bank_transfer → awaiting_payment + payment(ready) created', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment', depositorName: '홍길동' }));
    const paymentCreatedAt = new Date('2026-06-14T00:00:00.000Z');
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow({ createdAt: paymentCreatedAt }));

    const result = await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);
    expect(result).toMatchObject({
      status: 'awaiting_payment',
      payment: {
        method: 'bank_transfer',
        status: 'ready',
        amount: 120000,
      },
      paymentInstructions: {
        bankName: '국민은행',
        bankAccount: '123-456',
        bankHolder: '팀밋',
      },
    });
    expect(prisma.v1TournamentPayment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ method: 'bank_transfer', amount: 120000, status: 'ready' }) }),
    );
  });

  it('submit: returns the account instructions re-read under the tournament lock', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(openTournament({ bankAccount: 'before-lock' }))
      .mockResolvedValueOnce(openTournament({ bankAccount: 'after-lock' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'awaiting_payment', depositorName: '홍길동' }),
    );
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    const result = await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(result.paymentInstructions).toMatchObject({
      bankAccount: 'after-lock',
    });
  });

  it('submit: confirmed plus payment-stage registrations fill capacity → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);

    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          status: { in: ['awaiting_payment', 'payment_checking', 'paid', 'confirmed'] },
        }),
      }),
    );
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
  });

  it('submit: emits tournament_registration_submitted to the registration owner', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ appliedByUserId: 'original-applicant' }),
    );
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'awaiting_payment', appliedByUserId: 'original-applicant' }),
    );
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'original-applicant',
      'tournament_registration_submitted',
      'tournament-1',
      expect.any(String),
    );
  });

  // ─── Task 154 P0-4: 기록 공개 동의는 팀장이 대신 켜주지 않는다 ─────────────────
  //
  // 이 저장소는 "선수 본인이 켠다"는 옵트인 구조를 유지하기로 결정했다(사용자 결정 ①⑤).
  // 그런데 대회 참가 신청은 팀장만 할 수 있으므로, 여기서 명단 선수들의 공개 상태를
  // 건드리는 순간 그 구조가 팀장 대리 동의로 조용히 바뀐다. 아래 첫 테스트가 그
  // 불변식을 고정하는 회귀 방어선이다 -- 여기가 깨지면 정책이 깨진 것이다.

  function submitWithRecordDisclosure() {
    // 기본 mock 은 RECORD_DISCLOSURE_ID 를 코드로 매핑하지 않는다(위 '미동의' 테스트들이
    // 그 기본값에 의존한다) -- 기존 2026-08-18 테스트들과 같은 방식으로 이 호출에만 덮어쓴다.
    managedTerms.assertTournamentAcceptances.mockResolvedValueOnce({
      acceptedDocumentIds: [RULES_ID, PRIVACY_ID, REFUND_ID, RECORD_DISCLOSURE_ID],
      notAcceptedDocumentIds: [MEDIA_ID],
      acceptedCodes: new Set([
        'tournament_rules',
        'tournament_privacy',
        'tournament_refund',
        'tournament_record_disclosure',
      ]),
    });
    return service.submit(manager, 'tournament-1', 'reg-1', {
      ...validSubmit,
      termsDocumentIds: [RULES_ID, PRIVACY_ID, REFUND_ID, RECORD_DISCLOSURE_ID],
    });
  }

  it('submit: 팀장이 기록 공개 동의를 체크해도 어떤 계정의 기록 공개 상태도 바뀌지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { userId: 'player-a' },
      { userId: 'player-b' },
    ]);

    await submitWithRecordDisclosure();
    // 지연 발송 resolver 까지 실제로 실행해 본다 -- 여기서 쓰기가 일어나면 안 된다.
    const resolveUserIds = notifications.emitToManyDeferred.mock.calls[0][0] as () => Promise<string[]>;
    await resolveUserIds();

    // 공개 여부를 결정하는 유일한 테이블은 V1UserRecordConsent 다. 이 경로는 "누구에게
    // 물어볼지" 고르기 위해 읽기만 하고 절대 쓰지 않는다. mock 에 쓰기 메서드를 아예
    // 두지 않았으므로, 구현이 쓰기를 시도하면 TypeError 로 이 테스트가 깨진다.
    expect((prisma.v1UserRecordConsent as Record<string, unknown>).upsert).toBeUndefined();
    expect((prisma.v1UserRecordConsent as Record<string, unknown>).update).toBeUndefined();
    expect((prisma.v1UserRecordConsent as Record<string, unknown>).create).toBeUndefined();

    // 프로필 토글도 호출자(팀장) 본인 것만 건드린다 -- 명단 선수 계정은 대상이 아니다.
    for (const call of prisma.v1UserProfile.updateMany.mock.calls) {
      expect(call[0].where.userId).toBe(manager.id);
    }
  });

  it('submit: 기록 공개 동의를 체크하면 명단 선수 각자에게 동의 안내 알림을 예약한다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    await submitWithRecordDisclosure();

    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'tournament_record_consent_invite',
      'tournament-1',
      expect.any(String),
    );
  });

  it('submit: 기록 공개 동의를 체크하지 않으면 안내 알림도 보내지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });

  it('submit: 안내 알림 대상에서 이미 응답한 사람(켠 사람·끈 사람 모두)을 제외한다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { userId: 'player-new' },
      { userId: 'player-granted' },
      { userId: 'player-revoked' },
      { userId: 'player-new' }, // 중복 행이 있어도 한 번만 보낸다
    ]);
    // 켠 사람에겐 불필요하고, 끈 사람에게 다시 묻는 건 그 거부를 무시하는 것이다.
    prisma.v1UserRecordConsent.findMany.mockResolvedValue([
      { userId: 'player-granted' },
      { userId: 'player-revoked' },
    ]);

    await submitWithRecordDisclosure();

    const resolveUserIds = notifications.emitToManyDeferred.mock.calls[0][0] as () => Promise<string[]>;
    await expect(resolveUserIds()).resolves.toEqual(['player-new']);
  });

  it('submit: 명단이 비어 있으면 동의 조회를 아예 하지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([]);

    await submitWithRecordDisclosure();

    const resolveUserIds = notifications.emitToManyDeferred.mock.calls[0][0] as () => Promise<string[]>;
    await expect(resolveUserIds()).resolves.toEqual([]);
    expect(prisma.v1UserRecordConsent.findMany).not.toHaveBeenCalled();
  });

  it('submit: pg method does not require depositorName', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow({ method: 'pg' }));
    const result = await service.submit(manager, 'tournament-1', 'reg-1', {
      ...validSubmit, paymentMethod: 'pg', depositorName: undefined,
    });
    expect(result).toMatchObject({ payment: { method: 'pg' } });
  });

  // ─── submit: tournament_record_disclosure → tournamentRealNameVisible 연동 ──────
  // (2026-08-18 사용자 결정 -- 소급 금지 회귀 테스트 포함)

  it('submit: 대회 경기 기록 공개(선택) 동의 → tournamentRealNameVisible 을 false→true 로 켠다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
    managedTerms.assertTournamentAcceptances.mockResolvedValueOnce({
      acceptedDocumentIds: [RULES_ID, PRIVACY_ID, REFUND_ID, RECORD_DISCLOSURE_ID],
      notAcceptedDocumentIds: [MEDIA_ID],
      acceptedCodes: new Set([
        'tournament_rules',
        'tournament_privacy',
        'tournament_refund',
        'tournament_record_disclosure',
      ]),
    });

    await service.submit(manager, 'tournament-1', 'reg-1', {
      ...validSubmit,
      termsDocumentIds: [RULES_ID, PRIVACY_ID, REFUND_ID, RECORD_DISCLOSURE_ID],
    });

    expect(prisma.v1UserProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: manager.id, tournamentRealNameVisible: false },
      data: { tournamentRealNameVisible: true },
    });
  });

  it('submit: 대회 경기 기록 공개(선택) 미동의 → tournamentRealNameVisible 을 건드리지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
    // 기본 managedTerms mock(beforeEach)은 RULES/PRIVACY/REFUND 만 accepted 로 잡고
    // RECORD_DISCLOSURE_ID 는 애초에 termsDocumentIds 에 없다 -- validSubmit 그대로 사용.

    await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(prisma.v1UserProfile.updateMany).not.toHaveBeenCalled();
  });

  it('소급 금지 회귀: v1.1 tournament_privacy 에만 동의했던 기존 사용자는 이 신청으로 토글이 건드려지지 않는다', async () => {
    // Given: v1.1 시절부터 tournament_privacy(필수, 실명 공개와 무관한 10개 목적)에는
    // 이미 동의해 왔지만 신규 선택 항목(tournament_record_disclosure)에는 동의한 적 없는
    // 기존 사용자가, v1.2 배포 이후 같은 필수 항목들로 새 대회에 신청하는 상황.
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());
    managedTerms.assertTournamentAcceptances.mockResolvedValueOnce({
      acceptedDocumentIds: [RULES_ID, PRIVACY_ID, REFUND_ID],
      notAcceptedDocumentIds: [MEDIA_ID, RECORD_DISCLOSURE_ID],
      acceptedCodes: new Set(['tournament_rules', 'tournament_privacy', 'tournament_refund']),
    });

    await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(prisma.v1UserProfile.updateMany).not.toHaveBeenCalled();
  });

  // ─── cancel-request ─────────────────────────────────────────────────────────────

  it('cancel-request: draft → cancelled (self-service)', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'draft' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    const result = await service.cancelRequest(manager, 'tournament-1', 'reg-1', {});
    expect(result).toMatchObject({ status: 'cancelled' });
  });

  it('cancel-request: confirmed → cancel_requested (admin handles)', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }));
    const result = await service.cancelRequest(manager, 'tournament-1', 'reg-1', { reason: '사정' });
    expect(result).toMatchObject({ status: 'cancel_requested' });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
      }),
    );
  });

  it('cancel-request: already cancelled → 409 NOT_CANCELLABLE', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    await expect(service.cancelRequest(manager, 'tournament-1', 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_CANCELLABLE' },
    });
  });

  // ─── withdrawCancelRequest ─────────────────────────────────────────────────────

  it('withdrawCancelRequest: cancel_requested -> previous status and clears cancel fields', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({
        status: 'cancel_requested',
        cancelPreviousStatus: 'confirmed',
        cancelRequestedAt: new Date('2026-06-15T00:00:00Z'),
        cancelReason: '사정',
      }),
    );
    // R16-001 / R17-006: the function now reads the tournament inside the transaction
    // to guard against admin cancellation and over-capacity restoration.
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({
      method: 'bank_transfer',
      status: 'paid',
      amount: 120000,
      paidAt: null,
    }));

    const result = await service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1');

    expect(result).toMatchObject({ status: 'confirmed' });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'confirmed',
          cancelRequestedAt: null,
          cancelPreviousStatus: null,
          cancelReason: null,
        }),
      }),
    );
  });

  it('withdrawCancelRequest: non cancel_requested -> 409 NOT_WITHDRAWABLE', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    await expect(service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_CANCEL_REQUEST_NOT_WITHDRAWABLE' },
    });
  });

  it('withdrawCancelRequest: R16-001 — tournament cancelled → 409 TOURNAMENT_ALREADY_CANCELLED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    );
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ status: 'cancelled' }));
    await expect(service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_ALREADY_CANCELLED' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('withdrawCancelRequest: R17-006 — capacity full → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    // Restoring 'confirmed' (a CAPACITY_HOLD_STATUS) when already at capacity must fail.
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    );
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.count.mockResolvedValue(8); // already at limit (excl. current reg)
    await expect(service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('get: unknown registration → 404', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);
    await expect(service.get(manager, 'tournament-1', 'ghost')).rejects.toThrow(NotFoundException);
  });

  // ─── getMyRegistration ───────────────────────────────────────────────────────

  it('getMyRegistration: returns the caller\'s most-recent registration', async () => {
    const row = registrationRow({ appliedByUserId: manager.id, status: 'awaiting_payment' });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(row);
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    const result = await service.getMyRegistration(manager, 'tournament-1');
    expect(result).toMatchObject({
      id: 'reg-1',
      appliedByUserId: manager.id,
      status: 'awaiting_payment',
      payment: { method: 'bank_transfer', status: 'ready', amount: 120000 },
      paymentInstructions: {
        bankName: '국민은행',
        bankAccount: '123-456',
        bankHolder: '팀밋',
      },
    });
    // Must query by tournamentId AND appliedByUserId — not by a different user's id
    expect(prisma.v1TournamentRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 'tournament-1', appliedByUserId: manager.id }),
      }),
    );
  });

  it('getMyRegistration: 입금 안내 후 오래 지난 awaiting_payment 신청도 자동 취소되지 않고 그대로 유지된다', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T00:00:00.000Z'));
    const createdAt = new Date('2026-06-14T00:00:00.000Z');
    const longOverdueRegistration = registrationRow({ appliedByUserId: manager.id, status: 'awaiting_payment' });
    const longOverduePayment = paymentRow({ createdAt, status: 'ready' });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(longOverdueRegistration);
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(longOverduePayment);
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());

    const result = await service.getMyRegistration(manager, 'tournament-1');

    expect(result).toMatchObject({
      status: 'awaiting_payment',
      payment: { status: 'ready' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.update).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('getMyRegistration: 404 TOURNAMENT_REGISTRATION_NOT_FOUND when no registration exists', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);
    await expect(service.getMyRegistration(manager, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_REGISTRATION_NOT_FOUND' },
    });
  });

  it('getMyRegistration: ignores registrations belonging to other users', async () => {
    // Simulate other user's registration being returned — should NOT happen because
    // the where clause filters by appliedByUserId. We verify by checking the query args.
    const otherUser = { id: 'other-user', email: 'o@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null); // correct: no result for this user
    await expect(service.getMyRegistration(otherUser, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_REGISTRATION_NOT_FOUND' },
    });
    expect(prisma.v1TournamentRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ appliedByUserId: otherUser.id }),
      }),
    );
  });

  it('getMyRegistrations: returns team-scoped registrations for joined teams', async () => {
    const rows = [
      {
        ...registrationRow({ id: 'reg-team-1', teamId: 'team-1', status: 'draft' }),
        payment: null,
        team: { id: 'team-1', name: '1번 팀' },
      },
      {
        ...registrationRow({ id: 'reg-team-2', teamId: 'team-2', status: 'awaiting_payment' }),
        payment: {
          method: 'bank_transfer', status: 'ready', amount: 120000, paidAt: null,
          createdAt: new Date('2026-06-14T00:00:00Z'),
        },
        team: { id: 'team-2', name: '2번 팀' },
      },
    ];
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(rows);
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentPlayer.groupBy.mockResolvedValue([
      { registrationId: 'reg-team-1', _count: { registrationId: 1 } },
      { registrationId: 'reg-team-2', _count: { registrationId: 3 } },
    ]);

    const result = await service.getMyRegistrations(manager, 'tournament-1');

    expect(result).toEqual([
      expect.objectContaining({ id: 'reg-team-1', teamId: 'team-1', teamName: '1번 팀', playerCount: 1 }),
      expect.objectContaining({
        id: 'reg-team-2',
        teamId: 'team-2',
        teamName: '2번 팀',
        playerCount: 3,
        paymentInstructions: {
          bankName: '국민은행',
          bankAccount: '123-456',
          bankHolder: '팀밋',
        },
      }),
    ]);
    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          OR: expect.arrayContaining([
            expect.objectContaining({ appliedByUserId: manager.id }),
            expect.objectContaining({
              team: expect.objectContaining({
                memberships: expect.objectContaining({
                  some: expect.objectContaining({ userId: manager.id, status: 'active' }),
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('getMyRegistrations: returns an empty list when no managed team registration exists', async () => {
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);

    await expect(service.getMyRegistrations(manager, 'tournament-1')).resolves.toEqual([]);
    expect(prisma.v1TournamentPlayer.groupBy).not.toHaveBeenCalled();
  });
});
