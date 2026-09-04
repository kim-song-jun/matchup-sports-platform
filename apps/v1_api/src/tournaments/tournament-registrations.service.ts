import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  V1CompetitionKind,
  V1Tournament,
  V1TournamentPayment,
  V1TournamentRegistration,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { isPhoneVerificationEnforced } from '../verification/phone-verification-access';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CancelRegistrationRequestDto,
  CreateRegistrationDto,
  SubmitRegistrationDto,
} from './dto/tournament-registration.dto';
import { capacityLimitOf, isCapacityFull } from './registration-capacity';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from './tournament-surface-lookup';

/** cancel-request로 어드민 처리가 필요한 상태(이미 운영에 반영됨). */
const CANCELLABLE_VIA_REQUEST: V1TournamentRegistration['status'][] = [
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
];

const CAPACITY_HOLD_STATUSES: V1TournamentRegistration['status'][] = [
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
];

/**
 * 대회 경기 기록 공개(실명 표시) 선택 동의 정책 코드. `tournament_privacy`(필수, 10개
 * 수집·이용 목적)와는 별도 정책이다 -- V1ManagedTermsPlacement가 @@unique([policyId,
 * context])라 한 정책은 하나의 requirement만 가질 수 있어, 필수 문서 안에 선택 항목을
 * 섞으면 그 항목도 사실상 강제 동의가 된다. 마이그레이션 근거:
 * prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent.
 */
const TOURNAMENT_RECORD_DISCLOSURE_CODE = 'tournament_record_disclosure';

type TournamentPaymentInstructionSource = Pick<
  V1Tournament,
  'entryFee' | 'bankName' | 'bankAccount' | 'bankHolder'
>;


/**
 * 신청을 받는 중인지 — **리그와 대회가 판정 축이 다르다.**
 *
 * · **대회**: `status === 'open'` 이 곧 "모집 중" 이다(운영자가 상태로 연다). 그대로 둔다.
 * · **리그**: 판정자는 `registrationDeadlineAt` 하나다(정본 §6, 2026-09-04 사용자 확정).
 *   `status` 는 수명주기 표시 전용이 됐다 — `generateFixtures` 가 `in_progress` 로 옮기기
 *   때문에 status 를 보면 **대진이 있는 리그가 영영 신청을 못 받는다**(alpha 실측).
 *
 * 두 축을 한 조건으로 합치지 않는 이유: 대회의 `status === 'open'` 요구를 건드리면 대회
 * 신청 경로 전체가 회귀 범위에 들어온다. 리그만 갈라 대회는 한 줄도 안 바뀌게 한다.
 */
function assertRegistrationOpen(tournament: {
  kind: string | null;
  status: string;
  registrationDeadlineAt: Date | null;
}): void {
  if (tournament.kind === 'regular_league') {
    if (tournament.status === 'completed' || tournament.status === 'cancelled') {
      throw new ConflictException({ code: 'TOURNAMENT_NOT_OPEN', message: '지금은 참가 신청을 받지 않아요.' });
    }
    if (tournament.registrationDeadlineAt === null) {
      // 마감이 없으면 아무도 연 적이 없는 리그다(정본 §6 "안 정하면 신청을 안 받는다").
      throw new ConflictException({ code: 'TOURNAMENT_NOT_OPEN', message: '지금은 참가 신청을 받지 않아요.' });
    }
    if (tournament.registrationDeadlineAt.getTime() < Date.now()) {
      throw new ConflictException({ code: 'REGISTRATION_DEADLINE_PASSED', message: '신청이 마감됐어요.' });
    }
    return;
  }
  if (tournament.status !== 'open') {
    throw new ConflictException({ code: 'TOURNAMENT_NOT_OPEN', message: '지금은 참가 신청을 받지 않아요.' });
  }
  if (tournament.registrationDeadlineAt && tournament.registrationDeadlineAt.getTime() < Date.now()) {
    throw new ConflictException({ code: 'REGISTRATION_DEADLINE_PASSED', message: '신청이 마감됐어요.' });
  }
}

@Injectable()
export class TournamentRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly managedTerms: ManagedTermsRuntimeService,
  ) {}

  /** 팀장 또는 운영진(manager+)만 대회 신청을 관리할 수 있다. */
  private async assertTeamManager(teamId: string, userId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        team: { status: 'active', deletedAt: null },
      },
      select: { team: { select: { sportId: true } } },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 매니저만 신청을 관리할 수 있어요.',
      });
    }
    return membership.team.sportId;
  }

  private assertTeamSportMatchesTournament(teamSportId: string, tournamentSportId: string) {
    if (teamSportId !== tournamentSportId) {
      throw new ConflictException({
        code: 'TEAM_SPORT_MISMATCH',
        message: '대회 종목과 같은 종목의 팀만 신청할 수 있어요.',
      });
    }
  }

  private assertPaymentInstructions(
    tournament: Pick<V1Tournament, 'entryFee' | 'bankName' | 'bankAccount' | 'bankHolder'>,
    paymentMethod: SubmitRegistrationDto['paymentMethod'],
  ) {
    if (paymentMethod !== 'bank_transfer' || tournament.entryFee <= 0) return;
    if (
      !tournament.bankName?.trim() ||
      !tournament.bankAccount?.trim() ||
      !tournament.bankHolder?.trim()
    ) {
      throw new ConflictException({
        code: 'TOURNAMENT_PAYMENT_INSTRUCTIONS_MISSING',
        message: '대회 입금 계좌가 준비되지 않아 신청할 수 없어요. 운영팀에 문의해 주세요.',
      });
    }
  }

  private async loadOpenTournament(tournamentId: string): Promise<V1Tournament> {
    const tournament = await findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, {
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    assertRegistrationOpen(tournament);
    return tournament;
  }

  private async assertCapacityAvailable(
    tournamentId: string,
    competition: { kind: V1CompetitionKind | null; teamCount: number },
  ) {
    // 상한이 없으면(정규 리그) 세지도 않는다 — 결과를 안 쓸 COUNT 를 날릴 이유가 없다.
    if (capacityLimitOf(competition) === null) return;
    const reservedCount = await this.prisma.v1TournamentRegistration.count({
      where: {
        tournamentId,
        status: { in: CAPACITY_HOLD_STATUSES },
      },
    });
    if (isCapacityFull(competition, reservedCount)) {
      throw new ConflictException({
        code: 'TOURNAMENT_CAPACITY_FULL',
        message: '정원이 가득 차서 더 이상 신청할 수 없어요.',
      });
    }
  }

  async create(user: V1AuthUser, tournamentId: string, dto: CreateRegistrationDto) {
    const tournament = await this.loadOpenTournament(tournamentId);
    const teamSportId = await this.assertTeamManager(dto.teamId, user.id);
    this.assertTeamSportMatchesTournament(teamSportId, tournament.sportId);

    const existing = await this.prisma.v1TournamentRegistration.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId: dto.teamId } },
    });
    if (existing && existing.status !== 'cancelled') {
      if (existing.status === 'draft') {
        await this.assertCapacityAvailable(tournamentId, tournament);
        return this.serialize(existing, null, await this.countPlayers(existing.id), tournament);
      }
      const [payment, playerCount] = await Promise.all([
        this.prisma.v1TournamentPayment.findUnique({ where: { registrationId: existing.id } }),
        this.countPlayers(existing.id),
      ]);
      return this.serialize(existing, payment, playerCount, tournament);
    }
    await this.assertCapacityAvailable(tournamentId, tournament);

    // 취소된 신청이 남아있으면(unique 제약) draft로 재활성화, 없으면 신규 생성.
    let registration: V1TournamentRegistration;
    try {
      registration = existing
        ? await this.prisma.v1TournamentRegistration.update({
            where: { id: existing.id },
            data: {
              status: 'draft',
              appliedByUserId: user.id,
              depositorName: null,
              agreedRules: false,
              agreedPrivacy: false,
              agreedRefund: false,
              agreedMediaConsent: false,
              cancelRequestedAt: null,
              cancelPreviousStatus: null,
              cancelReason: null,
              // 감사 finding(reg-confirm-reapply-state-machine #2/#3): 이전 사이클(확정→잠금→취소)의
              // 흔적을 되살아난 draft가 그대로 물려받아 (a) 새 신청인데 명단이 잠긴 채 시작하고
              // (b) 임시저장 상태인데 확정일이 함께 표시됐다. 취소 후 재신청은 완전히 새로운
              // 사이클이므로 이전 확정·잠금·마감예외 상태를 전부 초기화한다.
              rosterLockedAt: null,
              rosterDeadlineOverrideAt: null,
              confirmedAt: null,
              confirmedByAdminUserId: null,
            },
          })
        : await this.prisma.v1TournamentRegistration.create({
            data: { tournamentId, teamId: dto.teamId, appliedByUserId: user.id, status: 'draft' },
          });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedRegistration = await this.prisma.v1TournamentRegistration.findUnique({
          where: { tournamentId_teamId: { tournamentId, teamId: dto.teamId } },
        });
        if (racedRegistration) {
          return this.serialize(
            racedRegistration,
            null,
            await this.countPlayers(racedRegistration.id),
            tournament,
          );
        }
        throw new ConflictException({
          code: 'TOURNAMENT_REGISTRATION_UNIQUE_SCOPE_MISMATCH',
          message: '대회 신청 중복 기준이 팀 단위로 적용되지 않았어요. 운영자에게 문의해 주세요.',
        });
      }
      throw error;
    }

    return this.serialize(registration, null, 0, tournament);
  }

  private async assertTeamMember(teamId: string, userId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        team: { status: 'active', deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀에 속한 멤버만 신청 내역을 볼 수 있어요.',
      });
    }
  }

  /**
   * 신청 제출은 대회 운영·정산·본인확인의 시작점이라 신청 주체가 확인된 사람이어야 한다.
   * 조회(목록·상세)와 draft 생성은 그대로 열어 두고 **제출 시점에만** 막는다 — 유입을 막지 않고
   * 실명성이 실제로 필요해지는 지점에서만 거른다.
   */
  private async assertPhoneVerified(userId: string) {
    if (!isPhoneVerificationEnforced()) return;
    const account = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: { phoneVerifiedAt: true },
    });
    if (!account?.phoneVerifiedAt) {
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: '휴대폰 본인인증을 완료해야 대회에 신청할 수 있어요.',
      });
    }
  }

  async submit(user: V1AuthUser, tournamentId: string, registrationId: string, dto: SubmitRegistrationDto) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    const teamSportId = await this.assertTeamManager(registration.teamId, user.id);
    await this.assertPhoneVerified(user.id);
    const termsDecisions = await this.managedTerms.assertTournamentAcceptances(dto.termsDocumentIds);

    if (registration.status !== 'draft') {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_DRAFT',
        message: '이미 제출된 신청이에요.',
      });
    }
    // 제출 시점에 대회가 여전히 open·마감 전인지 재확인(draft 보관 중 마감됐을 수 있음).
    const tournament = await this.loadOpenTournament(tournamentId);
    this.assertTeamSportMatchesTournament(teamSportId, tournament.sportId);
    // 계좌 안내 검증은 **잠근 뒤에만** 한다(아래 `lockedTournament` 기준). 여기서 한 번 더
    // 부르면 반대 방향 TOCTOU 가 생긴다: 제출 직전에 유료 → 0원으로 바뀌면 잠근 뒤에는
    // 통과할 요청을 **사전 호출이 거짓으로 막는다**(`entryFee <= 0` 이면 계좌가 필요 없다).
    // 같은 이유로 정원·마감·상태·입금자명도 전부 잠근 뒤 값으로만 판단한다(Copilot 리뷰 지적).


    const result = await this.prisma.$transaction(async (tx) => {
      // R17-005: acquire row lock on tournament before the capacity check so that
      // concurrent submissions read a consistent reservation count and only one
      // submission can claim the last slot.
      await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${tournamentId} FOR UPDATE`;

      // Re-validate tournament state inside the transaction (prevents TOCTOU with status change).
      // **종류 조건은 트랜잭션 안에서도 걸어야 한다.** 밖의 `loadOpenTournament` 만 막으면
      // 이 재검증이 리그 행을 통과시키고, 그 사실이 밖에서는 드러나지 않는다 — 겉보기엔
      // 닫힌 것처럼 보이기 때문이다.
      const lockedTournament = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
        where: { id: tournamentId, deletedAt: null },
      });
      if (!lockedTournament) {
        throw new ConflictException({ code: 'TOURNAMENT_NOT_OPEN', message: '지금은 참가 신청을 받지 않아요.' });
      }
      // 트랜잭션 안에서도 **같은 판정 함수**를 쓴다 — 밖과 안이 다른 규칙을 보면 TOCTOU
      // 재검증이 통과시키는 것과 막는 것이 갈린다.
      assertRegistrationOpen(lockedTournament);
      this.assertPaymentInstructions(lockedTournament, dto.paymentMethod);

      // ## 입금자명은 **낼 돈이 있을 때만** 필요하다 — 그리고 **잠근 뒤의 값**으로 판단한다
      // 원래 이 가드는 대회를 읽기 **전**에 있어서 `entryFee` 를 모른 채 계좌이체면 무조건
      // 입금자명을 요구했다(0원 대회·리그에서도 막혔다). 화면이 안 물어도 옛 클라이언트·API
      // 직접 호출은 그대로 걸린다 — 정본 §4 "스텝 최소" 는 화면이 아니라 **계약**의 문제다.
      //
      // **트랜잭션 밖의 `tournament.entryFee` 로 판단하면 TOCTOU 다**(Copilot 리뷰 지적).
      // 실제 청구액은 아래에서 `lockedTournament.entryFee` 로 정해지므로, 제출 직전에
      // 운영자가 0원 → 유료로 바꾸면 **가드는 건너뛰고 청구는 발생**해서 입금자명이 `null`
      // 인 계좌이체 신청이 남는다 — 운영자가 들어온 입금을 어느 팀 것인지 못 맞춘다.
      // 같은 이유로 `status`·마감·정원도 전부 잠근 뒤 다시 본다(바로 위 세 검사).
      if (
        lockedTournament.entryFee > 0 &&
        dto.paymentMethod === 'bank_transfer' &&
        !dto.depositorName?.trim()
      ) {
        throw new BadRequestException({
          code: 'DEPOSITOR_NAME_REQUIRED',
          message: '계좌이체는 입금자명을 입력해 주세요.',
        });
      }

      // 상한이 없으면(정규 리그) 세지 않는다 — 결과를 안 쓸 COUNT 를 날릴 이유가 없다.
      const reservedCount =
        capacityLimitOf(lockedTournament) === null
          ? 0
          : await tx.v1TournamentRegistration.count({
              where: {
                tournamentId,
                status: { in: CAPACITY_HOLD_STATUSES },
              },
            });
      if (isCapacityFull(lockedTournament, reservedCount)) {
        throw new ConflictException({
          code: 'TOURNAMENT_CAPACITY_FULL',
          message: '정원이 가득 차서 더 이상 신청할 수 없어요.',
        });
      }

      // ## 참가비가 0 이면 입금 단계를 건너뛴다 (Task 164 BE-4, 정본 §4 "스텝 최소")
      // 지금까지는 `entryFee` 와 무관하게 `awaiting_payment` 로 보냈고, 그 상태는
      // `ADMIN_CONFIRMABLE_STATUSES` 에 없다. 그래서 **0원짜리 대회·리그에도 운영자가
      // "입금 확인" 을 한 번 눌러야** 확정할 수 있었다 — 확인할 입금이 없는데.
      //
      // 착지 상태는 **`confirmPayment` 가 만드는 것과 정확히 같다**(등록 `payment_checking`
      // + 결제 `paid`). 다른 상태로 보내면 그 뒤의 취소·환불·목록 필터가 0원 건만 다르게
      // 다루게 되고, 그 차이는 여기가 아니라 먼 곳에서 드러난다.
      //
      // `confirmedByAdminUserId` 는 비운다 — 아무도 확인하지 않았다는 것이 사실이다.
      const isFree = lockedTournament.entryFee <= 0;
      // 무료면 제출 순간이 곧 정산 시점이고, 유료면 아직 낸 적이 없으므로 `null` 이다
      // (재제출에서 옛 결제의 시각이 남아 있으면 안 된다 — 그래서 유료도 명시적으로 비운다).
      const settledAt = isFree ? new Date() : null;
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: isFree ? 'payment_checking' : 'awaiting_payment',
          // `!` 를 쓸 수 없다 — 입금자명 가드에 `entryFee > 0` 을 붙이면서 **"계좌이체면
          // 반드시 있다" 는 전제가 깨졌다.** 0원 + 계좌이체 + 미전달이면 `undefined.trim()`
          // 으로 500 이 난다(Copilot 리뷰 지적, 재현 확인). 공백·미전달은 `null` 로 저장한다.
          depositorName:
            dto.paymentMethod === 'bank_transfer' ? (dto.depositorName?.trim() || null) : null,
          agreedRules: termsDecisions.acceptedCodes.has('tournament_rules'),
          agreedPrivacy: termsDecisions.acceptedCodes.has('tournament_privacy'),
          agreedRefund: termsDecisions.acceptedCodes.has('tournament_refund'),
          agreedMediaConsent: termsDecisions.acceptedCodes.has('tournament_media'),
          cancelPreviousStatus: null,
        },
      });
      const payment = await tx.v1TournamentPayment.upsert({
        where: { registrationId },
        create: {
          registrationId,
          method: dto.paymentMethod,
          amount: lockedTournament.entryFee,
          status: isFree ? 'paid' : 'ready',
          paidAt: settledAt,
          provider: dto.paymentMethod === 'pg' ? 'toss' : null,
        },
        update: {
          method: dto.paymentMethod,
          amount: lockedTournament.entryFee,
          status: isFree ? 'paid' : 'ready',
          provider: dto.paymentMethod === 'pg' ? 'toss' : null,
          // `paidAt` 은 **한 번만** 적는다. 예전엔 여기 `paidAt: null` 이 뒤에 따로 있었고,
          // 0원 분기를 스프레드로 앞에 얹었더니 **그 null 이 덮어썼다** — 재제출(결제 행이
          // 이미 있는 경우)에서 `status: 'paid'` 인데 `paidAt: null` 인 행이 나온다
          // (Copilot 리뷰가 잡았다. 내 첫 스펙은 `create` 만 단언해서 못 봤다).
          paidAt: settledAt,
          // **과거 사이클의 운영자 id 를 지운다.** 결제 행을 재사용(upsert update)하면
          // 이전 제출에서 "입금 확인" 을 누른 어드민 id 가 그대로 남고, 어드민 목록·상세
          // 응답에 실려 나간다 — 이번 제출은 아무도 확인하지 않았는데 확인한 사람이
          // 있는 것처럼 보인다(Copilot 리뷰 지적). `cancelledAt`·`refundedAt` 을 비우는
          // 것과 같은 이유다: 새 사이클은 옛 사이클의 흔적을 물려받지 않는다.
          confirmedByAdminUserId: null,
          cancelledAt: null,
          refundedAt: null,
        },
      });
      await this.managedTerms.recordTournamentDecisions(
        tx,
        user.id,
        registrationId,
        registration.teamId,
        termsDecisions,
      );
      // 2026-08-18 사용자 결정: 대회 경기 기록 공개(선택) 동의 시 실명 표시 토글을 켠다.
      // - 기존 값이 false인 사람만 켠다(updateMany where 조건) -- 이미 true면 그대로 두고,
      //   프로필 row가 아직 없으면(온보딩 미완료) 0행 매치로 조용히 no-op한다. submit()은
      //   대회 신청 제출이 본 목적이라 프로필 부재로 이 트랜잭션을 실패시키지 않는다.
      // - "사용자가 명시적으로 껐던 것"과 "한 번도 켠 적 없는 기본값 false"를 구분할 감사
      //   컬럼이 없다(V1UserProfile에 이력 필드 없음, updatedAt은 다른 필드 변경과 공유) --
      //   이 구분은 현재 불가능하다는 걸 알고 default-false를 true로 뒤집는다.
      // - 미동의로 신청해도 여기서 false로 되돌리지 않는다(다른 대회에서 이미 켠 상태일 수
      //   있음 -- 이 토글은 대회 단위가 아니라 계정 단위 전역 스위치다).
      // - 2026-08-23(Task 154 P0-4): 이 블록은 **그대로 둔다.** 여기서 켜는 건 호출자
      //   본인(팀장) 계정의 실명 표시뿐이라 "본인이 본인 것에 동의"라는 옵트인 전제를
      //   깨지 않는다. 다만 이 동의 항목의 이름("대회 경기 기록 공개")이 약속하는 **기록
      //   공개** 축(`V1UserRecordConsent`)은 여기서 켜지지 않고, 명단에 오른 다른 선수에게도
      //   아무 일이 일어나지 않는다 -- 그 공백은 아래 트랜잭션 밖의 동의 안내 알림이 메운다.
      if (termsDecisions.acceptedCodes.has(TOURNAMENT_RECORD_DISCLOSURE_CODE)) {
        await tx.v1UserProfile.updateMany({
          where: { userId: user.id, tournamentRealNameVisible: false },
          data: { tournamentRealNameVisible: true },
        });
      }
      return { updated, payment, tournament: lockedTournament };
    });

    // 알림: 신청자에게 접수 안내 (fire-and-forget — 트랜잭션 실패와 무관)
    void this.notifications.emitNotification(
      result.updated.appliedByUserId,
      'tournament_registration_submitted',
      tournamentId,
      `"${result.tournament.title}" 대회 입금 안내를 확인해 주세요.`,
    );

    // Task 154 P0-4 / 사용자 결정 ⑤ (2026-08-23): 기록 공개 동의를 **명단에 오른 선수
    // 본인에게** 묻는다.
    //
    // 여기서 어떤 계정의 공개 상태도 바꾸지 않는다는 점이 이 블록의 핵심 불변식이다 --
    // 이 메서드를 호출할 수 있는 사람은 `assertTeamManager`를 통과한 팀장뿐이므로,
    // 팀장의 체크 하나로 선수들의 기록을 공개해버리면 그건 "선수 본인이 켠다"는 옵트인
    // 구조를 팀장 대리 동의로 바꾸는 것이다(사용자가 명시적으로 배제한 방향).
    // 그래서 팀장의 동의는 **알림을 보내는 방아쇠로만** 쓰고, 실제 전환은 알림을 받은
    // 선수가 딥링크에서 직접 누를 때만 일어난다.
    //
    // 이미 응답한 사람(GRANTED/REVOKED 무관)은 제외한다 -- 켠 사람에겐 불필요하고,
    // 끈 사람에게 다시 묻는 건 그 거부를 무시하는 것이다.
    if (termsDecisions.acceptedCodes.has(TOURNAMENT_RECORD_DISCLOSURE_CODE)) {
      this.notifications.emitToManyDeferred(
        async () => {
          const roster = await this.prisma.v1TournamentPlayer.findMany({
            where: { registrationId, removedAt: null },
            select: { userId: true },
          });
          const userIds = Array.from(new Set(roster.map((row) => row.userId)));
          if (userIds.length === 0) return [];
          const responded = await this.prisma.v1UserRecordConsent.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true },
          });
          const respondedIds = new Set(responded.map((row) => row.userId));
          return userIds.filter((userId) => !respondedIds.has(userId));
        },
        'tournament_record_consent_invite',
        tournamentId,
        `"${result.tournament.title}" 대회 기록을 프로필에 공개할지 정해 주세요.`,
      );
    }

    const playerCount = await this.prisma.v1TournamentPlayer.count({
      where: { registrationId, removedAt: null },
    });
    return this.serialize(result.updated, result.payment, playerCount, result.tournament);
  }

  async cancelRequest(
    user: V1AuthUser,
    tournamentId: string,
    registrationId: string,
    dto: CancelRegistrationRequestDto,
  ) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    // draft는 운영 반영 전이라 즉시 취소(self-service). 그 이후 상태는 어드민 처리 대기.
    if (registration.status === 'draft') {
      const cancelled = await this.prisma.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: 'cancelled',
          cancelRequestedAt: new Date(),
          cancelPreviousStatus: null,
          cancelReason: dto.reason ?? null,
        },
      });
      return this.serialize(cancelled, null, 0);
    }
    if (!CANCELLABLE_VIA_REQUEST.includes(registration.status)) {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CANCELLABLE',
        message: '현재 상태에서는 취소할 수 없어요.',
      });
    }

    const updated = await this.prisma.v1TournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'cancel_requested',
        cancelRequestedAt: new Date(),
        cancelPreviousStatus: registration.status,
        cancelReason: dto.reason ?? null,
      },
    });
    return this.serialize(updated, null, await this.countPlayers(registrationId));
  }

  async withdrawCancelRequest(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    if (registration.status !== 'cancel_requested') {
      throw new ConflictException({
        code: 'REGISTRATION_CANCEL_REQUEST_NOT_WITHDRAWABLE',
        message: '취소 요청 중인 신청만 철회할 수 있어요.',
      });
    }

    const restoredStatus = registration.cancelPreviousStatus ?? 'awaiting_payment';

    const updated = await this.prisma.$transaction(async (tx) => {
      // R16-001: lock tournament and re-check its status; an admin-cancelled tournament
      // must not have registrations restored to an active status.
      await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${tournamentId} FOR UPDATE`;
      const tournament = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
        where: { id: tournamentId, deletedAt: null },
        select: { id: true, status: true, teamCount: true, kind: true },
      });
      if (!tournament) {
        // **여기서 정하는 것은 "대회·리그가 통합 표면에서 조회되지 않을 때" 하나뿐이다** —
        // 같은 not-found 를 두 자리에서 다르게 다룬다: **진입 검사 = 404, 잠금 후 재조회 = 409.**
        //
        // *"행이 없을 때"가 아니다.* 위 조회는 `findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, …)`
        // 라 **행이 남아 있어도 종류가 표면을 벗어나면** 여기로 온다.
        //
        // (이 파일의 409 전부가 경합이라는 뜻이 **아니다.** 권한·종목 불일치·마감·정원처럼
        // 경합과 무관한 409 가 이 파일에 따로 여럿 있다. 이 문단은 그것들과 무관하다.)
        //
        // 여기 도달했다는 것은 바깥 검사를 통과한 뒤 이 트랜잭션이 `FOR UPDATE` 로 잠그고
        // **다시 읽었을 때** 대회가 사라졌다는 뜻이다 — 처음부터 없었던 것이 아니라
        // **그 사이에 바뀐 것**이다(삭제되었거나, 종류가 대회 표면을 벗어났거나).
        // 그래서 `TOURNAMENT_STATE_CHANGED` 이고, 이 재검증 블록의 이웃 throw 들
        // (`TOURNAMENT_ALREADY_CANCELLED`·`TOURNAMENT_CAPACITY_FULL`)과 같은 계열이다.
        //
        // **404 로 뒤집지 마라.** 잠금 뒤 재검증은 "없다" 가 아니라 "바뀌었다" 를 뜻하고,
        // 클라이언트의 조치도 다르다(재시도 vs 포기). 진짜 404 는 이 파일 위쪽의 진입
        // 검사가 `NotFoundException` 으로 던진다 — **두 자리가 같은 코드 이름을 쓰면
        // 로그에서 구분되지 않고, 원인이 "없는 대회" 로 읽힌다.** 그게 이 이름의 이유다.
        throw new ConflictException({
          code: 'TOURNAMENT_STATE_CHANGED',
          message: '대회 상태가 방금 바뀌었어요. 다시 시도해 주세요.',
        });
      }
      if (tournament.status === 'cancelled') {
        throw new ConflictException({
          code: 'TOURNAMENT_ALREADY_CANCELLED',
          message: '취소된 대회의 신청 취소 요청은 철회할 수 없어요.',
        });
      }

      // R17-006: if the restored status holds a capacity slot, re-check capacity
      // before restoring so a withdrawal cannot exceed the tournament limit.
      if (CAPACITY_HOLD_STATUSES.includes(restoredStatus as typeof CAPACITY_HOLD_STATUSES[number])) {
        const reservedCount =
          capacityLimitOf(tournament) === null
            ? 0
            : await tx.v1TournamentRegistration.count({
                where: {
                  tournamentId,
                  id: { not: registrationId },
                  status: { in: CAPACITY_HOLD_STATUSES },
                },
              });
        if (isCapacityFull(tournament, reservedCount)) {
          throw new ConflictException({
            code: 'TOURNAMENT_CAPACITY_FULL',
            message: '정원이 가득 차 취소 요청을 철회할 수 없어요.',
          });
        }
      }

      return tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: restoredStatus,
          cancelRequestedAt: null,
          cancelPreviousStatus: null,
          cancelReason: null,
        },
      });
    });

    const [payment, playerCount, tournament] = await Promise.all([
      this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } }),
      this.countPlayers(registrationId),
      this.loadPaymentInstructionSource(tournamentId),
    ]);
    return this.serialize(updated, payment, playerCount, tournament);
  }

  async get(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamMember(registration.teamId, user.id);
    const [payment, playerCount, tournament] = await Promise.all([
      this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } }),
      this.countPlayers(registrationId),
      this.loadPaymentInstructionSource(tournamentId),
    ]);
    return this.serialize(registration, payment, playerCount, tournament);
  }

  /**
   * 로그인 유저 본인의 신청 조회 — registrationId 없이 tournamentId만으로 호출 가능.
   * appliedByUserId 기준으로 가장 최근 non-deleted 신청을 반환한다.
   * 없으면 404 TOURNAMENT_REGISTRATION_NOT_FOUND.
   */
  async getMyRegistration(user: V1AuthUser, tournamentId: string) {
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { tournamentId, appliedByUserId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'TOURNAMENT_REGISTRATION_NOT_FOUND',
        message: '신청 내역이 없어요.',
      });
    }
    const registrationId = registration.id;
    const [payment, playerCount, tournament] = await Promise.all([
      this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } }),
      this.countPlayers(registrationId),
      this.loadPaymentInstructionSource(tournamentId),
    ]);
    return this.serialize(registration, payment, playerCount, tournament);
  }

  /**
   * 로그인 유저가 운영 권한을 가진 팀들의 대회 신청 목록.
   * 신청 자체는 tournamentId + teamId 단위이므로 다중 팀 운영자는 여러 신청을 볼 수 있다.
   */
  async getMyRegistrations(user: V1AuthUser, tournamentId: string) {
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: {
        tournamentId,
        OR: [
          { appliedByUserId: user.id },
          {
            team: {
              status: 'active',
              deletedAt: null,
              memberships: {
                some: {
                  userId: user.id,
                  status: 'active',
                },
              },
            },
          },
        ],
      },
      include: {
        payment: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const playerCounts = registrations.length
      ? await this.prisma.v1TournamentPlayer.groupBy({
          by: ['registrationId'],
          where: {
            registrationId: { in: registrations.map((registration) => registration.id) },
            removedAt: null,
          },
          _count: { registrationId: true },
        })
      : [];
    const countByRegistrationId = new Map(
      playerCounts.map((row) => [row.registrationId, row._count.registrationId]),
    );
    const tournament = registrations.some(
      (registration) => registration.payment?.method === 'bank_transfer',
    )
      ? await this.loadPaymentInstructionSource(tournamentId)
      : null;

    return registrations.map((registration) =>
      this.serialize(
        registration,
        registration.payment,
        countByRegistrationId.get(registration.id) ?? 0,
        tournament,
      ),
    );
  }

  private loadPaymentInstructionSource(tournamentId: string) {
    return findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: {
        entryFee: true,
        bankName: true,
        bankAccount: true,
        bankHolder: true,
      },
    });
  }

  private async loadRegistration(tournamentId: string, registrationId: string): Promise<V1TournamentRegistration> {
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: '신청 내역을 찾을 수 없어요.' });
    }
    return registration;
  }

  private countPlayers(registrationId: string) {
    return this.prisma.v1TournamentPlayer.count({ where: { registrationId, removedAt: null } });
  }

  private serialize(
    row: V1TournamentRegistration,
    payment: V1TournamentPayment | null,
    playerCount: number,
    tournament?: TournamentPaymentInstructionSource | null,
  ) {
    const rowWithTeam = row as V1TournamentRegistration & { team?: { name?: string | null } | null };
    const paymentInstructions =
      payment?.method === 'bank_transfer' &&
      payment.status === 'ready' &&
      (tournament?.entryFee ?? 0) > 0 &&
      tournament?.bankName?.trim() &&
      tournament.bankAccount?.trim() &&
      tournament.bankHolder?.trim()
        ? {
            bankName: tournament.bankName,
            bankAccount: tournament.bankAccount,
            bankHolder: tournament.bankHolder,
          }
        : null;
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      teamId: row.teamId,
      teamName: rowWithTeam.team?.name ?? null,
      appliedByUserId: row.appliedByUserId,
      status: row.status,
      depositorName: row.depositorName,
      agreedRules: row.agreedRules,
      agreedPrivacy: row.agreedPrivacy,
      agreedRefund: row.agreedRefund,
      agreedMediaConsent: row.agreedMediaConsent,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      rosterLockedAt: row.rosterLockedAt?.toISOString() ?? null,
      rosterDeadlineOverrideAt: row.rosterDeadlineOverrideAt?.toISOString() ?? null,
      cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      playerCount,
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
            paidAt: payment.paidAt?.toISOString() ?? null,
          }
        : null,
      paymentInstructions,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
