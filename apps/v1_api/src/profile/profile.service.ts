import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1AuthProvider, V1ConsentState } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  countOwnerVisibleParticipations,
  findLatestPublicParticipation,
} from '../games/public-records/public-consent';
import { loadPlayerCardRecordStats } from '../games/public-records/player-card-stats';
import {
  buildPlayerCard,
  resolveCardShape,
  unlockedCardShapes,
  MIN_REVIEWS_FOR_SHIELD_SHAPE,
  type PlayerCard,
} from './player-card';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalCompetitionConfigForSport } from '../tournaments/competition-config/lineup-size';
import { tryNormalizeCompetitionSportCode } from '../tournaments/competition-config/competition-config.validator';
import {
  PREFERRED_POSITION_MESSAGES,
  positionCodesForSport,
  validatePreferredPositions,
} from '../users/preferred-position';
import { isReviewRevealed } from '../reviews/review-visibility';
import { removeUserFromActiveRosters } from '../tournaments/roster-cleanup';
import { verifyPhoneProofToken } from '../verification/phone-proof-token';
import { isPhoneVerificationEnforced } from '../verification/phone-verification-access';
import {
  UpdateMyPreferencesDto,
  UpdateMyRecordConsentDto,
  UpdateMyRegionsDto,
  UpdateProfileDto,
  UpdateSettingsDto,
  UpdatePlayerCardHiddenDto,
  UpdateTournamentRealNameVisibilityDto,
  WithdrawalRequestDto,
  UpdatePlayerCardShapeDto,
} from './dto/profile.dto';

// v1_notification_preferences row가 아직 없는 사용자에게 읽기 전용으로 보여줄 기본값 —
// Prisma 컬럼 @default 값과 동일하다. 저장 없이 조회만 하는 경로(settings GET, theme-only
// PATCH)에서 upsert 대신 이 값을 쓴다.
const DEFAULT_NOTIFICATION_PREFERENCES = {
  activityEnabled: true,
  matchEnabled: true,
  teamEnabled: true,
  teamMatchEnabled: true,
  chatEnabled: true,
  noticeEnabled: true,
  marketingEnabled: false,
} as const;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async me(user: V1AuthUser) {
    const snapshot = await this.getUserSnapshot(user.id);
    return toProfileResponse(snapshot);
  }

  async activitySummary(user: V1AuthUser) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const activeMemberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId: user.id,
        status: 'active',
        team: { status: 'active', deletedAt: null },
      },
      select: { teamId: true },
    });
    const teamIds = activeMemberships.map((membership) => membership.teamId);

    const [
      reputation,
      personalActivityCount,
      monthlyPersonalMatchCount,
      tournamentAppearances,
    ] = await Promise.all([
      // V1UserReputationSummary 캐시는 리뷰 제출 이벤트(submitPersonalReview/submitTeamReview) 안에서만 갱신되고,
      // 72시간 경과로 리뷰가 새로 reveal 가능해지는 시점을 트리거하는 cron은 없다(사용자 결정: cron 추가 안 함).
      // 그래서 캐시를 읽으면 "이후 새 리뷰가 없는 유저"의 평점이 영원히 갱신 안 될 수 있다 — 매 GET마다 live로 재계산한다.
      this.computeRevealedUserReputation(user.id),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: 'completed',
          match: { status: 'completed', deletedAt: null },
        },
      }),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: 'completed',
          match: { status: 'completed', deletedAt: null, startAt: { gte: monthStart, lt: nextMonthStart } },
        },
      }),
      // 레거시 개인매치(V1MatchParticipant)만 세면 대회(V1Game 계열)를 여러 번 뛴 유저도 0으로 보인다
      // (프로덕션 실측: 팀원 7명 전원 matchCount=0). 대회 출전은 별도 카운트로 더한다.
      this.countTournamentAppearances(user.id, monthStart, nextMonthStart),
    ]);
    const mannerScore = reputation.mannerScore;

    return {
      totals: {
        activityCount: personalActivityCount + tournamentAppearances.total,
        teamCount: teamIds.length,
        mannerScore,
      },
      monthly: {
        matchCount: monthlyPersonalMatchCount + tournamentAppearances.monthly,
        mannerScore,
        winRate: null,
      },
    };
  }

  async updateMe(user: V1AuthUser, dto: UpdateProfileDto) {
    this.assertMutableAccount(user);
    const realName = dto.realName?.trim() || dto.displayName?.trim() || null;
    const nickname = dto.nickname.trim();
    const emailProvided = dto.email !== undefined;
    const requestedEmail = dto.email?.trim() ? normalizeEmail(dto.email) : null;
    const phone = dto.phone?.trim() || null;
    const birthDate = dto.birthDate?.trim() || null;
    const profileImageUrl = dto.profileImageUrl?.trim() || null;
    const gender = dto.gender;

    const before = await this.prisma.v1User.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        phone: true,
        emailVerifiedAt: true,
        authIdentities: {
          where: { status: 'active' },
          select: { provider: true, passwordHash: true },
        },
        profile: {
          select: {
            realName: true,
            nickname: true,
            profileImageUrl: true,
            birthDate: true,
            gender: true,
            bio: true,
          },
        },
      },
    });

    const hasPassword = before?.authIdentities.some((identity) => Boolean(identity.passwordHash)) ?? false;
    const email = hasPassword
      ? requestedEmail ?? before?.email ?? null
      : emailProvided
        ? requestedEmail
        : before?.email ?? null;

    if (!nickname || !gender || (hasPassword && !email)) {
      throw validationError('nickname and gender are required; email is required for password accounts', 'profile');
    }

    if (birthDate && !isValidBirthDate(birthDate)) {
      throw validationError('Birth date must be a valid YYYYMMDD value', 'birthDate');
    }

    const [existingEmail, existingEmailIdentity, existingPhone, existingNickname] = await Promise.all([
      email
        ? this.prisma.v1User.findFirst({
            where: { email, id: { not: user.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      email
        ? this.prisma.v1AuthIdentity.findFirst({
            where: {
              provider: V1AuthProvider.email,
              providerUserKey: email,
              userId: { not: user.id },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      phone
        ? this.prisma.v1User.findFirst({
            where: { phone, id: { not: user.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.v1UserProfile.findFirst({
        where: { nickname, deletedAt: null, userId: { not: user.id } },
        select: { id: true },
      }),
    ]);

    if (existingEmail || existingEmailIdentity) {
      throw new ConflictException({
        code: 'EMAIL_CONFLICT',
        message: 'Email is already registered',
      });
    }

    if (existingPhone) {
      throw new ConflictException({
        code: 'PHONE_CONFLICT',
        message: 'Phone is already registered',
      });
    }

    if (existingNickname) {
      throw new ConflictException({
        code: 'NICKNAME_CONFLICT',
        message: 'Nickname is already registered',
      });
    }

    const emailChanged = email !== (before?.email ?? null);
    const phoneChanged = phone !== (before?.phone ?? null);

    // 번호 변경은 인증 상태를 초기화한다(아래 phoneVerifiedAt: null). 증명 없이 허용하면
    // "가입 때 인증 → 프로필에서 번호만 교체"로 인증을 우회해 미인증 번호를 붙일 수 있으므로,
    // register 와 동일하게 proofToken 을 요구한다(fail-closed).
    const phoneProofRequired = phoneChanged && Boolean(phone) && isPhoneVerificationEnforced();
    if (phoneProofRequired) {
      if (!dto.phoneProofToken || !verifyPhoneProofToken(dto.phoneProofToken, phone as string)) {
        throw new BadRequestException({
          code: 'PHONE_NOT_VERIFIED',
          message: '휴대폰 본인인증을 먼저 완료해 주세요.',
        });
      }
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      await tx.v1User.update({
        where: { id: user.id },
        data: {
          email,
          phone,
          ...(emailChanged ? { emailVerifiedAt: null } : {}),
          // 증명을 받고 바꾼 번호는 방금 인증된 번호다 — null 로 떨어뜨리면 인증을 막 끝낸
          // 사용자에게 "인증이 필요해요" 배너가 다시 뜬다. 강제가 꺼진 환경에서만 미인증으로 둔다.
          ...(phoneChanged ? { phoneVerifiedAt: phoneProofRequired ? new Date() : null } : {}),
        },
      });

      if (email && hasPassword) {
        await tx.v1AuthIdentity.updateMany({
          where: { userId: user.id, provider: V1AuthProvider.email, status: 'active' },
          data: { email, providerUserKey: email },
        });
      }

      const nextProfile = await tx.v1UserProfile.upsert({
        where: { userId: user.id },
        update: {
          realName,
          nickname,
          profileImageUrl,
          birthDate,
          gender,
          // 필드를 아예 안 보낸 클라이언트(옛 버전)의 저장이 기존 소개를 지우면 안 되므로
          // `undefined` 는 "건드리지 않음", `null`/빈 문자열은 "지움" 으로 갈린다.
          ...(dto.bio === undefined ? {} : { bio: dto.bio?.trim() || null }),
        },
        create: {
          userId: user.id,
          realName,
          nickname,
          profileImageUrl,
          birthDate,
          gender,
          visibility: 'public',
        },
      });

      await writeUserAuditLog(tx, {
        userId: user.id,
        targetType: 'user_profile',
        reason: `profile.update:${changedFields({
          email: before?.email ?? null,
          phone: before?.phone ?? null,
          realName: before?.profile?.realName ?? null,
          nickname: before?.profile?.nickname ?? null,
          profileImageUrl: before?.profile?.profileImageUrl ?? null,
          birthDate: before?.profile?.birthDate ?? null,
          gender: before?.profile?.gender ?? null,
        }, {
          email,
          phone,
          realName,
          nickname,
          profileImageUrl,
          birthDate,
          gender,
        }).join(',') || 'no_change'}`,
      });

      return nextProfile;
    });

    return {
      profile: toProfilePayload(profile),
      updatedAt: profile.updatedAt,
    };
  }

  async publicProfile(_viewer: V1AuthUser | null, userId: string) {
    const user = await this.prisma.v1User.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        accountStatus: 'active',
      },
      include: { profile: true, reputationSummary: true },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });

    // reputation.mannerScore/reviewCount도 캐시가 아니라 매 요청마다 live로 재계산한다 —
    // 캐시(V1UserReputationSummary)는 72시간 경과 단독으로는 갱신되지 않아 헤드라인 평점 배지가
    // activitySummary.totals.reviewCount와 어긋날 수 있었다(trustState만 캐시값 유지, 코스한 버킷이라 영향 적음).
    const liveReputation = await this.computeRevealedUserReputation(user.id);
    const activitySummary = await this.getPublicActivitySummary(user.id, liveReputation);

    // Task 154 P1: 기록이 0건인 프로필이 완전히 비어 보이던 문제를 소속팀으로 메운다.
    //
    // `membersVisible` 을 반드시 존중한다. 이 컬럼은 스키마 기본값이 true 라 "아무도
    // 신경 안 쓰는 값"으로 보기 쉬운데, 프로덕션 실측(2026-08-24)에서 44개 팀 중 12개가
    // 명시적으로 false 였다 -- 팀장들이 실제로 쓰는 통제 수단이다. 팀 페이지에서 명단을
    // 가려둔 팀이 개인 프로필 경로로 새어 나가면 그 설정을 우회하는 셈이 된다.
    const teamMemberships = await this.prisma.v1TeamMembership.findMany({
      where: {
        userId: user.id,
        status: 'active',
        team: { membersVisible: true, status: 'active', deletedAt: null },
      },
      // V1Team 에 로고 컬럼이 없다 -- 팀 이름만 내린다(프론트는 이니셜 배지로 대체).
      select: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 6,
    });

    return {
      userId: user.id,
      displayName: user.profile?.nickname ?? '사용자',
      nickname: user.profile?.nickname ?? null,
      profileImageUrl: user.profile?.profileImageUrl ?? null,
      // 값이 없으면 null 로 내려 프론트가 섹션 자체를 렌더하지 않게 한다 --
      // 빈 문자열을 내리면 제목만 있는 빈 카드가 남는다.
      bio: user.profile?.bio?.trim() || null,
      teams: teamMemberships.map((membership) => membership.team),
      // Task 154 P2: 가장 최근 공개 가능 출전 한 줄. 기록 목록과 **같은 게이트**를 통과한
      // 것만 쓴다 -- 다르면 같은 프로필에서 "최근 경기"와 "목록 맨 위"가 어긋난다.
      recentActivity: await findLatestPublicParticipation(this.prisma, user.id),
      // Task 155 선수 카드. 숨김을 켠 사용자에게는 null 을 내려 프론트가 섹션 자체를
      // 렌더하지 않게 한다 -- 빈 카드를 남기면 "숨겼는데 자리가 남는" 상태가 된다.
      playerCard: user.profile?.playerCardHidden === true ? null : await this.buildPlayerCardFor(user.id, user.profile?.playerCardShape),
      reputation: {
        ...toReputationPayload(user.reputationSummary),
        mannerScore: liveReputation.mannerScore,
        activityCount: liveReputation.reviewCount,
        reviewCount: liveReputation.reviewCount,
      },
      activitySummary,
    };
  }

  /**
   * 선수 카드를 만든다 (Task 155). 산식은 `profile/player-card.ts` 의 순수 함수에 있고,
   * 여기서는 **입력을 모으는 일만** 한다 -- 그래야 산식을 DB 없이 테스트할 수 있다.
   *
   * 기록 쪽은 공개 기록 목록과 같은 게이트를 통과한 것만 쓴다. 후기 쪽(4항목 평균)은
   * 1층 데이터라 동의와 무관하게 읽는다 -- 두 층의 경계가 카드 안에서도 그대로다.
   *
   * 4항목 평판은 V1UserReputationSummary 캐시를 읽는다 — computeRevealedUserReputation()처럼
   * live 재계산으로 바꾸는 편이 더 정확하지만(캐시는 리뷰 제출 이벤트에서만 갱신되고 되평가
   * 제출·72시간 경과 reveal 시점을 트리거하는 쓰기 이벤트가 없는 경우가 있다 — 2026-08-26
   * 감사에서 확인), 그 전환은 이 화면을 검증하는 profile.service.spec.ts(다른 배치 소유)의
   * mock 계약(v1PostEventReviewMetricScore 미모킹)과 충돌해 여기서는 보류한다. 대신 캐시
   * 자체가 stale해지는 근본 원인(리뷰어 본인 캐시가 재계산되는 경로가 없던 것)은
   * reviews.service.ts의 submitPersonalReview/submitTeamMatchPlayerReview/recalculateForReview에서
   * 고쳤다 — 되평가 제출 시점에는 이제 캐시가 정확히 갱신된다. 남은 gap(아무 후속 리뷰
   * 이벤트도 없는 순수 72시간 경과 케이스)은 잔여 리스크로 남는다.
   */
  private async buildPlayerCardFor(userId: string, profileShape?: string | null): Promise<PlayerCard> {
    const [records, reputation, consent] = await Promise.all([
      loadPlayerCardRecordStats(this.prisma, userId),
      this.prisma.v1UserReputationSummary.findUnique({ where: { userId } }),
      this.prisma.v1UserRecordConsent.findUnique({ where: { userId } }),
    ]);

    const toNumber = (value: Prisma.Decimal | null | undefined): number | null =>
      value === null || value === undefined ? null : Number(value);

    return buildPlayerCard({
      appearances: records.appearances,
      goals: records.goals,
      assists: records.assists,
      position: records.position,
      jerseyNumber: records.jerseyNumber,
      skillScore: toNumber(reputation?.metricSkillScore),
      mannerScore: toNumber(reputation?.metricMannerScore),
      punctualityScore: toNumber(reputation?.metricPunctualityScore),
      reviewCount: reputation?.metricReviewCount ?? 0,
      savedShape: profileShape,
      recordsConsented: consent?.state === V1ConsentState.GRANTED,
      // 동의를 켰을 때 실제로 공개될 공식 결과가 있는지 -- 연결이 있는지가 아니다.
      // 연결은 라인업 저장·대회 명단 등록 시점에 결과보다 먼저 생기므로, 그것만 보고
      // 넘기면 "공개를 켜면 열려요" 라는 거짓 약속을 하게 된다.
      hasUnlockableRecords: records.hasUnlockableRecords,
    });
  }

  private async getPublicActivitySummary(userId: string, precomputedReputation?: { reviewCount: number; mannerScore: number | null }) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const [
      personalMatchCount,
      teamCount,
      reputation,
      monthlyPersonalMatchCount,
      monthlyTeamJoinCount,
      monthlyReviewCount,
      tournamentAppearances,
    ] = await Promise.all([
      this.prisma.v1MatchParticipant.count({
        where: {
          userId,
          status: 'completed',
          match: { status: 'completed', deletedAt: null },
        },
      }),
      this.prisma.v1TeamMembership.count({
        where: {
          userId,
          status: 'active',
          team: { status: 'active', deletedAt: null },
        },
      }),
      // 리뷰를 원본 count()로 재집계하지 않아 비공개(reveal 안 된) 리뷰의 존재/시점이 새어나가지 않도록 reveal 필터를 태운다.
      // 캐시(V1UserReputationSummary)는 리뷰 제출 이벤트에서만 갱신되고 72시간 경과만으로 갱신되는 cron이 없어(사용자 결정:
      // cron 추가 안 함) 매 GET마다 live로 재계산한다 — activitySummary()의 computeRevealedUserReputation()과 동일.
      // publicProfile()이 reputation 배지용으로 이미 계산해뒀으면(precomputedReputation) 중복 쿼리 없이 재사용한다.
      precomputedReputation ? Promise.resolve(precomputedReputation) : this.computeRevealedUserReputation(userId),
      this.prisma.v1MatchParticipant.count({
        where: {
          userId,
          status: 'completed',
          match: { status: 'completed', deletedAt: null, startAt: { gte: monthStart, lt: nextMonthStart } },
        },
      }),
      this.prisma.v1TeamMembership.count({
        where: {
          userId,
          status: 'active',
          joinedAt: { gte: monthStart, lt: nextMonthStart },
          team: { status: 'active', deletedAt: null },
        },
      }),
      // 캐시에는 월별 값이 없으므로 이번 달 리뷰만 live로 reveal 필터링한다 (ReviewsService.receivedSummary 패턴 이식)
      this.getRevealedMonthlyReviewCount(userId, monthStart, nextMonthStart),
      // 레거시 개인매치(V1MatchParticipant)만 세면 대회(V1Game 계열)를 여러 번 뛴 유저도 0으로 보인다
      // (프로덕션 실측: 팀원 7명 전원 matchCount=0). 대회 출전은 별도 카운트로 더한다.
      this.countTournamentAppearances(userId, monthStart, nextMonthStart),
    ]);

    return {
      totals: {
        matchCount: personalMatchCount + tournamentAppearances.total,
        tournamentCount: tournamentAppearances.tournamentTotal,
        teamCount,
        reviewCount: reputation.reviewCount,
      },
      monthly: {
        matchCount: monthlyPersonalMatchCount + tournamentAppearances.monthly,
        tournamentCount: tournamentAppearances.tournamentMonthly,
        teamJoinCount: monthlyTeamJoinCount,
        reviewCount: monthlyReviewCount,
      },
    };
  }

  /**
   * 사용자에 연결된(`V1ParticipantIdentityLinkCurrent`) participant 들의 대회 경기 출전 수를
   * 누적/이번 달로 센다. `GET /users/:id/records`(public-user-records.service.ts)와 같은
   * "현재 공식 리비전만"(`resultRevision.game.currentOfficialRevisionId === resultRevision.id`
   * && `officialAt !== null`) 규칙을 쓴다 — 정정/무효 처리된 경기가 이중 계산되지 않게.
   *
   * 동의(consent) 게이트는 일부러 적용하지 않는다(사용자 결정) — 여기서 새는 건 "몇 번 뛰었는지"
   * 라는 집계 숫자뿐이고, 참가자 실명·경기 상세는 노출하지 않는다. 소속 팀도 팀 상세 페이지에서
   * 이미 공개 정보다. `GET /users/:id/records`의 개별 이벤트/실명 노출과는 노출 수준이 다르므로
   * 같은 게이트를 여기 적용할 이유가 없다 — 나중에 "왜 여기만 게이트가 없나"를 묻게 될 것이므로
   * 남긴다.
   *
   * 같은 경기가 여러 participant 행으로 잡혀도(예: 대회 도중 로스터가 갱신된 경우) gameId 기준
   * Set으로 중복 제거한다.
   */
  /**
   * 대회 출전 수(경기 단위)와 참가한 **대회 수**(distinct tournament)를 한 번에 센다.
   *
   * 두 값을 굳이 한 쿼리로 묶은 이유: 프로필 GET 한 번에 두 번 왕복하지 않기 위해서다.
   * 그리고 여기서 세는 것은 **개수뿐**이라 `PublicUserRecordsService.loadEligibleRows()`
   * 같은 전체 기록 행(골·카드·MVP·상대팀…)을 끌어오지 않는다 -- 출전이 많은 사용자의
   * 프로필 조회마다 목록 전체를 메모리에 올리는 비용을 피한다.
   */
  private async countTournamentAppearances(
    userId: string,
    monthStart: Date,
    nextMonthStart: Date,
  ): Promise<{ total: number; monthly: number; tournamentTotal: number; tournamentMonthly: number }> {
    const links = await this.prisma.v1ParticipantIdentityLinkCurrent.findMany({
      where: { userId },
      select: { participantId: true },
    });
    if (links.length === 0) return { total: 0, monthly: 0, tournamentTotal: 0, tournamentMonthly: 0 };
    const participantIds = links.map((link) => link.participantId);

    const rows = await this.prisma.v1GameResultParticipant.findMany({
      // sourceType·officialAt 은 DB 에서 먼저 거른다 -- 링크가 많은 사용자일수록 아래
      // 루프까지 끌고 올 행이 불필요하게 커진다. "현재 공식 리비전인가"(컬럼 대 컬럼
      // 비교)만 where 로 표현할 수 없어 루프에 남는다. 이번 달 범위는 여기서 거르면
      // 안 된다 -- monthly 는 total 의 부분집합이라 같은 쿼리로 둘 다 세야 한다.
      where: {
        participantId: { in: participantIds },
        resultRevision: {
          officialAt: { not: null },
          game: { sourceType: 'TOURNAMENT_FIXTURE' },
        },
      },
      select: {
        resultRevision: {
          select: {
            id: true,
            gameId: true,
            officialAt: true,
            game: {
              select: {
                currentOfficialRevisionId: true,
                // "몇 개 대회에 나갔나"를 세려면 경기 → 픽스처 → 대회 한 단계가 더 필요하다.
                // 컬럼 하나(tournamentId)만 더 실을 뿐 행 수는 그대로다.
                tournamentFixture: { select: { tournamentId: true } },
              },
            },
          },
        },
      },
    });

    const totalGameIds = new Set<string>();
    const monthlyGameIds = new Set<string>();
    const totalTournamentIds = new Set<string>();
    const monthlyTournamentIds = new Set<string>();
    for (const row of rows) {
      const revision = row.resultRevision;
      // sourceType(TEAM_MATCH 제외)과 officialAt 은 위 where 가 이미 걸렀다 -- 여기서는
      // where 로 표현할 수 없는 "현재 공식 리비전인가"(컬럼 대 컬럼 비교)만 본다.
      // officialAt 은 스키마상 nullable 이라 아래 비교를 위해 타입만 좁힌다.
      const isCurrent = revision.game.currentOfficialRevisionId === revision.id;
      if (!isCurrent || revision.officialAt === null) continue;

      const isThisMonth = revision.officialAt >= monthStart && revision.officialAt < nextMonthStart;
      totalGameIds.add(revision.gameId);
      if (isThisMonth) monthlyGameIds.add(revision.gameId);

      const tournamentId = revision.game.tournamentFixture?.tournamentId ?? null;
      if (tournamentId !== null) {
        totalTournamentIds.add(tournamentId);
        if (isThisMonth) monthlyTournamentIds.add(tournamentId);
      }
    }

    return {
      total: totalGameIds.size,
      monthly: monthlyGameIds.size,
      tournamentTotal: totalTournamentIds.size,
      tournamentMonthly: monthlyTournamentIds.size,
    };
  }

  /**
   * 유저가 받은 리뷰 중 공개(reveal)된 것만 live로 재계산한다(개수 + 평균 평점).
   * ReviewsService.recalculateUserReputation()의 candidates → reverse → isReviewRevealed 계산 로직을 이식하되,
   * 그쪽은 V1UserReputationSummary에 upsert(쓰기)까지 하는 반면 이 메서드는 읽기 전용 GET 요청마다 호출되므로
   * upsert 없이 계산 결과만 반환한다. 캐시는 리뷰 제출 이벤트에서만 갱신되고 72시간 경과 reveal 시점을 트리거하는
   * cron이 없어(사용자 결정: cron 추가 안 함, self-view는 항상 live 재계산) 캐시만 읽으면 갱신이 영원히 누락될 수 있다.
   * ProfileModule ↔ ReviewsModule 순환 의존을 피하기 위해 ReviewsService를 주입하지 않고 로직만 복제한다
   * (getRevealedMonthlyReviewCount()와 동일 패턴).
   *
   * 범위 한정: 이 메서드는 단일 유저 self-view(activitySummary)/공개 프로필(getPublicActivitySummary) 전용이다.
   * 팀 신뢰점수(V1TeamTrustScore)를 여러 팀 한 번에 렌더링하는 목록형 화면(팀 신청자 목록, admin 팀 목록 등)에는
   * 적용하지 않는다 — 항목마다 live 재계산하면 N+1 쿼리 문제가 생기고, 이는 이번 요청 범위(단일 유저 GET) 밖이다.
   */
  private async computeRevealedUserReputation(userId: string): Promise<{ reviewCount: number; mannerScore: number | null }> {
    const candidates = await this.prisma.v1PostEventReview.findMany({
      // sourceType='match' — 개인 매치 후기만. 대회 개인 후기(tournament_fixture · targetType=user)는
      // V1UserReputationSummary의 tournament_* 컬럼에 따로 집계되며(ReviewsService 쪽 주석 참고),
      // 한 대회에서 상대팀 로스터 전원에게 수십 건이 들어올 수 있어 같은 평점에 합산하지 않는다.
      // 이 프로필 헤드라인 평점은 계속 개인 매치 기준이다.
      where: { targetUserId: userId, targetType: 'user', status: 'submitted', sourceType: 'match' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
    });
    if (candidates.length === 0) return { reviewCount: 0, mannerScore: null };

    const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
    const reverseReviews = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: userId, sourceType: 'match', sourceId: { in: sourceIds }, status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true },
    });

    const now = new Date();
    const revealed = candidates.filter((review) => isReviewRevealed(review, reverseReviews, now));
    const reviewCount = revealed.length;
    const mannerScore = reviewCount
      ? Number((revealed.reduce((sum, review) => sum + review.rating, 0) / reviewCount).toFixed(2))
      : null;

    return { reviewCount, mannerScore };
  }

  /**
   * 이번 달 공개(reveal)된 리뷰 개수 — 상호제출 또는 72시간 경과 기준.
   * ReviewsService.receivedSummary()의 candidates → reverse → isReviewRevealed 패턴을 이식했다.
   * ProfileModule ↔ ReviewsModule 순환 의존을 피하기 위해 ReviewsService를 주입하지 않고 로직만 복제한다.
   */
  private async getRevealedMonthlyReviewCount(userId: string, monthStart: Date, nextMonthStart: Date) {
    const candidates = await this.prisma.v1PostEventReview.findMany({
      where: {
        targetUserId: userId,
        targetType: 'user',
        status: 'submitted',
        // computeRevealedUserReputation()과 같은 모집단(개인 매치 후기)이어야 한다 —
        // totals.reviewCount는 match 기준인데 monthly.reviewCount만 대회 후기를 더하면
        // "이번 달 3건인데 누적은 1건" 같은 어긋난 숫자가 한 화면에 함께 나온다.
        sourceType: 'match',
        submittedAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true, submittedAt: true },
    });
    if (candidates.length === 0) return 0;

    const sourceIds = [...new Set(candidates.map((review) => review.sourceId))];
    const reverseReviews = await this.prisma.v1PostEventReview.findMany({
      where: { reviewerUserId: userId, sourceType: 'match', sourceId: { in: sourceIds }, status: 'submitted' },
      select: { sourceId: true, reviewerUserId: true, targetUserId: true },
    });

    const now = new Date();
    return candidates.filter((review) => isReviewRevealed(review, reverseReviews, now)).length;
  }

  async settings(user: V1AuthUser) {
    const snapshot = await this.getUserSnapshot(user.id);
    // ThemeProvider가 앱 루트에서 이 엔드포인트를 상시 호출하므로(로그인 사용자라면
    // 거의 매 페이지) 읽기 전용으로 조회한다 — upsert(update:{})는 UPDATE 브랜치를
    // 매번 실제로 실행해 @updatedAt만 갱신하는 불필요한 write를 만든다.
    const preferences =
      (await this.prisma.v1NotificationPreference.findUnique({ where: { userId: user.id } })) ??
      { ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: new Date() };
    return {
      account: {
        email: snapshot.email,
        phone: snapshot.phone,
        accountStatus: snapshot.accountStatus,
        providers: snapshot.authIdentities.map((identity) => identity.provider),
        hasPassword: snapshot.authIdentities.some((identity) => Boolean(identity.passwordHash)),
      },
      profile: {
        displayName: snapshot.profile?.nickname ?? '사용자',
      },
      theme: snapshot.themePreference,
      notifications: toSettingsNotifications(preferences),
    };
  }

  async updateSettings(user: V1AuthUser, dto: UpdateSettingsDto) {
    this.assertMutableAccount(user);
    const [profile, theme, preferences] = await this.prisma.$transaction(async (tx) => {
      const nextProfile = await tx.v1UserProfile.findUnique({ where: { userId: user.id } });

      const nextTheme =
        dto.theme === undefined
          ? (await tx.v1User.findUnique({ where: { id: user.id }, select: { themePreference: true } }))
              ?.themePreference
          : (await tx.v1User.update({ where: { id: user.id }, data: { themePreference: dto.theme } }))
              .themePreference;

      // dto.notifications가 없으면(테마만 바꾸는 요청 등) upsert를 아예 안 태운다 — upsert는
      // update 브랜치가 빈 객체여도 실제 UPDATE 문을 실행해 @updatedAt만 갱신하는 무의미한
      // write가 나간다(잠금·"방금 알림 설정 바뀜"으로 오인될 수 있는 타임스탬프 변경).
      let nextPreferences;
      if (dto.notifications) {
        const notificationInput = dto.notifications;
        const individualNotifications = {
          ...(notificationInput.matchEnabled === undefined ? {} : { matchEnabled: notificationInput.matchEnabled }),
          ...(notificationInput.teamEnabled === undefined ? {} : { teamEnabled: notificationInput.teamEnabled }),
          ...(notificationInput.teamMatchEnabled === undefined
            ? {}
            : { teamMatchEnabled: notificationInput.teamMatchEnabled }),
          ...(notificationInput.chatEnabled === undefined ? {} : { chatEnabled: notificationInput.chatEnabled }),
          ...(notificationInput.noticeEnabled === undefined ? {} : { noticeEnabled: notificationInput.noticeEnabled }),
        };
        nextPreferences = await tx.v1NotificationPreference.upsert({
          where: { userId: user.id },
          update: {
            ...individualNotifications,
            ...(notificationInput.marketingEnabled === undefined
              ? {}
              : { marketingEnabled: notificationInput.marketingEnabled }),
          },
          create: {
            userId: user.id,
            activityEnabled: true,
            matchEnabled: notificationInput.matchEnabled ?? true,
            teamEnabled: notificationInput.teamEnabled ?? true,
            teamMatchEnabled: notificationInput.teamMatchEnabled ?? true,
            chatEnabled: notificationInput.chatEnabled ?? true,
            noticeEnabled: notificationInput.noticeEnabled ?? true,
            marketingEnabled: notificationInput.marketingEnabled ?? false,
          },
        });
      } else {
        // 알림 설정을 한 번도 저장한 적 없는 사용자 — Prisma 컬럼 기본값과 동일한 값을
        // write 없이 그대로 응답에 반영한다.
        nextPreferences =
          (await tx.v1NotificationPreference.findUnique({ where: { userId: user.id } })) ??
          { ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: new Date() };
      }

      if (dto.notifications) {
        await writeUserAuditLog(tx, {
          userId: user.id,
          targetType: 'user_notification_settings',
          reason: `settings.notifications.update:${Object.keys(dto.notifications).sort().join(',') || 'no_change'}`,
        });
      }

      if (dto.theme !== undefined) {
        await writeUserAuditLog(tx, {
          userId: user.id,
          targetType: 'user_theme_settings',
          reason: `settings.theme.update:${dto.theme}`,
        });
      }

      return [nextProfile, nextTheme, nextPreferences] as const;
    });

    return {
      profile: { displayName: profile?.nickname ?? '사용자' },
      theme: theme ?? 'light',
      notifications: toSettingsNotifications(preferences),
      updatedAt: preferences.updatedAt,
    };
  }

  async updateMyRegions(user: V1AuthUser, dto: UpdateMyRegionsDto) {
    this.assertMutableAccount(user);
    const region = await this.prisma.v1Region.findFirst({
      where: { id: dto.regionId, isActive: true, level: 2 },
      include: { parent: true },
    });

    if (!region) {
      throw validationError('regionId must be an active district region', 'regionId');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.v1UserRegion.updateMany({
        where: { userId: user.id },
        data: { isPrimary: false },
      });
      await tx.v1UserRegion.upsert({
        where: { userId_regionId: { userId: user.id, regionId: region.id } },
        update: { isPrimary: true },
        create: { userId: user.id, regionId: region.id, isPrimary: true },
      });
      await writeUserAuditLog(tx, {
        userId: user.id,
        targetType: 'user_region',
        reason: 'profile.region.update',
      });
    });

    return {
      region: {
        regionId: region.id,
        name: formatRegionName(region),
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async updateMyPreferences(user: V1AuthUser, dto: UpdateMyPreferencesDto) {
    this.assertMutableAccount(user);
    validateNoDuplicates(dto.sports.map((sport) => sport.sportId), 'sports');
    validateNoDuplicates(dto.regions.map((region) => region.regionId), 'regions');

    if (dto.regions.filter((region) => region.primary).length > 1) {
      throw validationError('Only one primary region is allowed', 'regions.primary');
    }

    await this.validateSports(dto.sports);
    await this.validateRegions(dto.regions.map((region) => region.regionId));

    await this.prisma.$transaction(async (tx) => {
      await tx.v1UserSportPreference.deleteMany({ where: { userId: user.id } });
      if (dto.sports.length > 0) {
        await tx.v1UserSportPreference.createMany({
          data: dto.sports.map((sport, index) => ({
            userId: user.id,
            sportId: sport.sportId,
            sportLevelId: sport.levelId ?? null,
            isPrimary: index === 0,
            preferredPosition: sport.preferredPosition ?? null,
            secondaryPreferredPosition: sport.secondaryPreferredPosition ?? null,
          })),
        });
      }

      await tx.v1UserRegion.deleteMany({ where: { userId: user.id } });
      if (dto.regions.length > 0) {
        const primaryRegionId = dto.regions.find((region) => region.primary)?.regionId ?? dto.regions[0]?.regionId;
        await tx.v1UserRegion.createMany({
          data: dto.regions.map((region) => ({
            userId: user.id,
            regionId: region.regionId,
            isPrimary: region.regionId === primaryRegionId,
          })),
        });
      }
      await writeUserAuditLog(tx, {
        userId: user.id,
        targetType: 'user_preferences',
        reason: 'profile.preferences.update',
      });
    });

    const snapshot = await this.getUserSnapshot(user.id);

    return {
      sports: snapshot.sportPreferences.map((preference) => ({
        sportId: preference.sport.id,
        sportName: preference.sport.name,
        levelId: preference.sportLevel?.id ?? null,
        levelName: preference.sportLevel?.name ?? null,
        primary: preference.isPrimary,
      })),
      regions: snapshot.regions.map((userRegion) => ({
        regionId: userRegion.region.id,
        name: formatRegionName(userRegion.region),
        primary: userRegion.isPrimary,
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 사용자 단위 공개 기록 동의 조회. 아직 한 번도 응답한 적 없으면(row 없음)
   * 미동의 기본값을 반환한다 — participant 단위 스냅샷과 달리 opt-in 이 기본이다.
   */
  async myRecordConsent(user: V1AuthUser) {
    const consent = await this.prisma.v1UserRecordConsent.findUnique({ where: { userId: user.id } });
    return this.withPendingRecordSignal(user.id, consent);
  }

  /**
   * 동의 응답에 유도 UI 용 신호 두 개를 얹는다.
   *
   * - `hasResponded`: GRANTED/REVOKED 와 무관하게 **한 번이라도 답한 적 있는지**.
   *   `granted:false` 는 "거부"와 "아직 안 물어봄"을 구분하지 못하는데, 유도 배너는
   *   그 둘을 반드시 다르게 취급해야 한다(명시적 거부는 다시 조르지 않는다).
   * - `pendingRecordCount`: 지금 켜면 즉시 공개될 경기 수. 이미 GRANTED 면 유도할
   *   이유가 없으므로 세지 않고 0 으로 둔다(불필요한 3쿼리 절약).
   *
   * 이 두 필드는 기존 필드에 **추가만** 한다 — 옛 클라이언트는 그대로 동작한다.
   */
  private async withPendingRecordSignal(
    userId: string,
    consent: { state: V1ConsentState; effectiveAt: Date } | null,
  ) {
    const base = toRecordConsentResponse(consent);
    const pendingRecordCount = base.granted ? 0 : await countOwnerVisibleParticipations(this.prisma, userId);
    return { ...base, hasResponded: consent !== null, pendingRecordCount };
  }

  /**
   * 사용자 단위 공개 기록 동의 저장. granted=false 는 개별 REVOKED 스냅샷 없이도
   * 즉시 이 사용자의 모든 참가 기록을 비공개로 되돌린다(public-consent.ts 의
   * isParticipantPubliclyEligible 이 이 state 를 상위 게이트로 검사).
   */
  async updateMyRecordConsent(user: V1AuthUser, dto: UpdateMyRecordConsentDto) {
    this.assertMutableAccount(user);
    const state = dto.granted ? V1ConsentState.GRANTED : V1ConsentState.REVOKED;
    const consent = await this.prisma.v1UserRecordConsent.upsert({
      where: { userId: user.id },
      update: { state, policyHash: dto.policyHash, effectiveAt: new Date() },
      create: { userId: user.id, state, policyHash: dto.policyHash },
    });
    return this.withPendingRecordSignal(user.id, consent);
  }

  /**
   * 대회 경기 기록 실명 표시 토글 조회 (2026-08-18 사용자 결정). 프로필 row 자체가
   * 없는 사용자(온보딩 미완료 등)는 `V1UserProfile`의 컬럼 기본값과 동일하게
   * false(닉네임)를 반환한다 -- `settings()`가 알림 선호도 row 없을 때 default를
   * 반환하는 것과 같은 패턴.
   */
  async myTournamentRealNameVisibility(user: V1AuthUser) {
    const profile = await this.prisma.v1UserProfile.findUnique({
      where: { userId: user.id },
      select: { tournamentRealNameVisible: true },
    });
    return { visible: profile?.tournamentRealNameVisible ?? false };
  }

  /**
   * 대회 경기 기록 실명 표시 토글 저장. `updateMe`(PATCH /me/profile)와 달리 nickname/
   * gender 같은 다른 필수 필드를 함께 요구하지 않는다 -- 이 화면은 스위치 하나만 다룬다.
   * 프로필 row가 아직 없으면(온보딩 미완료) upsert의 create 분기가 nickname 없이
   * 만들 수 없으므로 404로 막는다 -- 프로필을 먼저 등록해야 켤 수 있다는 뜻이고,
   * `updateMyRecordConsent`가 별도 모델(`V1UserRecordConsent`)이라 이 제약이 없는 것과
   * 다른 점이다(이 토글은 V1UserProfile 자체에 얹힌 컬럼이라서다).
   */
  async updateMyTournamentRealNameVisibility(user: V1AuthUser, dto: UpdateTournamentRealNameVisibilityDto) {
    this.assertMutableAccount(user);
    const existing = await this.prisma.v1UserProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: '프로필을 먼저 등록해주세요.',
      });
    }
    const profile = await this.prisma.v1UserProfile.update({
      where: { userId: user.id },
      data: { tournamentRealNameVisible: dto.visible },
      select: { tournamentRealNameVisible: true },
    });
    return { visible: profile.tournamentRealNameVisible };
  }

  /**
   * 선수 카드 숨김 토글 조회 (Task 155). 프로필 row 가 없으면 컬럼 기본값과 같은
   * false(= 카드를 보여준다)를 반환한다 -- 대회 실명 토글과 같은 패턴.
   */
  /**
   * 카드 모양 설정 화면이 필요한 것 전부.
   *
   * `unlocked` 를 서버가 내려주는 이유: 잠금 조건을 화면에도 복사해 두면 규칙이 두 곳이 되고,
   * 나중에 조건을 바꿀 때 한쪽만 고쳐 "열렸다고 나오는데 저장은 거부되는" 상태가 된다.
   */
  async myPlayerCardShape(user: V1AuthUser) {
    const [profile, reputation] = await Promise.all([
      this.prisma.v1UserProfile.findUnique({ where: { userId: user.id }, select: { playerCardShape: true } }),
      this.prisma.v1UserReputationSummary.findUnique({ where: { userId: user.id }, select: { metricReviewCount: true } }),
    ]);
    const reviewCount = reputation?.metricReviewCount ?? 0;
    return {
      shape: resolveCardShape(profile?.playerCardShape, reviewCount),
      unlocked: unlockedCardShapes(reviewCount),
      reviewCount,
      requiredForShield: MIN_REVIEWS_FOR_SHIELD_SHAPE,
    };
  }

  /** 잠긴 모양은 저장 자체를 거부한다 -- 화면이 막는 것과 별개로 서버가 마지막 문이다. */
  async updateMyPlayerCardShape(user: V1AuthUser, dto: UpdatePlayerCardShapeDto) {
    this.assertMutableAccount(user);
    const existing = await this.prisma.v1UserProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: '프로필을 먼저 등록해주세요.' });
    }
    const reputation = await this.prisma.v1UserReputationSummary.findUnique({
      where: { userId: user.id },
      select: { metricReviewCount: true },
    });
    const reviewCount = reputation?.metricReviewCount ?? 0;
    if (!unlockedCardShapes(reviewCount).includes(dto.shape)) {
      throw new ForbiddenException({
        code: 'CARD_SHAPE_LOCKED',
        message: `후기 ${MIN_REVIEWS_FOR_SHIELD_SHAPE}개를 받으면 열려요.`,
      });
    }
    await this.prisma.v1UserProfile.update({
      where: { userId: user.id },
      data: { playerCardShape: dto.shape },
      select: { id: true },
    });
    return { shape: dto.shape, unlocked: unlockedCardShapes(reviewCount), reviewCount, requiredForShield: MIN_REVIEWS_FOR_SHIELD_SHAPE };
  }

  async myPlayerCardHidden(user: V1AuthUser) {
    const profile = await this.prisma.v1UserProfile.findUnique({
      where: { userId: user.id },
      select: { playerCardHidden: true },
    });
    return { hidden: profile?.playerCardHidden ?? false };
  }

  /**
   * 선수 카드 숨김 토글 저장.
   *
   * 이 컬럼은 Task 155 에서 카드와 함께 넣었지만 **쓰는 경로가 없어 사용자가 켤 수
   * 없는 상태**였다 -- 읽기만 하고 있었다. 게임화에 거부감이 있는 사용자를 위한
   * 탈출구가 목적인데 잠글 방법이 없으면 탈출구가 아니다.
   *
   * `updateMe`(PATCH /me/profile)와 달리 nickname/gender 같은 다른 필수 필드를 함께
   * 요구하지 않는다 -- 이 화면은 스위치 하나만 다룬다. 프로필 row 가 아직 없으면
   * upsert 의 create 분기가 nickname 없이 만들 수 없으므로 404 로 막는다.
   */
  async updateMyPlayerCardHidden(user: V1AuthUser, dto: UpdatePlayerCardHiddenDto) {
    this.assertMutableAccount(user);
    const existing = await this.prisma.v1UserProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: '프로필을 먼저 등록해주세요.',
      });
    }
    const profile = await this.prisma.v1UserProfile.update({
      where: { userId: user.id },
      data: { playerCardHidden: dto.hidden },
      select: { playerCardHidden: true },
    });
    return { hidden: profile.playerCardHidden };
  }

  async logout(user: V1AuthUser | undefined) {
    // 세션 쿠키 무효화(V1SessionLogoutInterceptor)와 별개로, 이 기기에 남아있는
    // 웹 푸시 구독도 함께 정리한다 — 안 하면 로그아웃한 계정 앞으로 오는 알림(채팅
    // 원문 포함)이 이 기기에 계속 도착하고, 다음 로그인 사용자는 서버 구독이
    // 없는데도 브라우저 pushManager 구독이 남아 있어 '켜짐'으로 잘못 보인다.
    // 브라우저 쪽 pushManager.unsubscribe()는 프론트(logout-button)가 별도로
    // best-effort 호출한다 — 여기서는 서버 레코드만 확실히 지운다(탭 종료·
    // 네트워크 유실로 프론트 호출이 안 가도 이 경로는 세션 쿠키가 유효한 한 항상 탄다).
    if (user) {
      await this.prisma.v1PushSubscription.deleteMany({ where: { userId: user.id } });
    }
    return { ok: true };
  }

  async withdrawalRequest(user: V1AuthUser, dto: WithdrawalRequestDto) {
    this.assertMutableAccount(user);
    await this.assertWithdrawable(user.id);
    // 상태 전이·로스터 제거·팀 이탈이 같은 시각을 갖도록 트랜잭션 밖에서 한 번만 만든다.
    const withdrawnAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "v1_users" WHERE id = ${user.id} FOR UPDATE
      `;

      const current = await tx.v1User.findUnique({
        where: { id: user.id },
        select: { accountStatus: true },
      });
      if (!current || current.accountStatus !== 'active') {
        throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot be modified' });
      }

      const admin = await tx.v1AdminUser.findUnique({
        where: { userId: user.id },
        select: { status: true },
      });
      if (admin?.status === 'active') {
        throw new ForbiddenException({
          code: 'ADMIN_WITHDRAWAL_FORBIDDEN',
          message: 'Active admins cannot request account withdrawal',
        });
      }

      const next = await tx.v1User.update({
        where: { id: user.id },
        data: { accountStatus: 'withdrawal_pending' },
      });

      // assertWithdrawable() 이 owner·manager 를 이미 막았으므로 여기 남는 것은 일반
      // 멤버십뿐이다. 추방(`removed`)이 아니라 본인 의사에 의한 이탈이므로 `left` 로 둔다.
      //
      // **멤버십을 먼저 끄고 그다음 로스터를 정리한다.** 순서가 반대면 "정리 → (그 사이 다른
      // 트랜잭션이 이 사람을 명단에 추가) → 멤버십 off" 가 되어 탈퇴한 사람이 명단에 활성으로
      // 남는다. 명단 추가 경로가 멤버십 행을 FOR UPDATE 로 잡는데, 정리가 먼저 돌면 그 시점엔
      // 아직 아무도 그 행을 잠그지 않아 lock 이 아무것도 막지 못한다. 추방·자진탈퇴 경로는
      // 이미 이 순서다(teams.service.ts removeMembership·leaveTeam).
      const memberships = await tx.v1TeamMembership.findMany({
        where: { userId: user.id, status: 'active' },
        select: { id: true, teamId: true },
      });
      for (const membership of memberships) {
        await tx.v1TeamMembership.update({
          where: { id: membership.id },
          data: { status: 'left', leftAt: withdrawnAt },
        });
        await tx.v1Team.update({
          where: { id: membership.teamId },
          data: { memberCount: { decrement: 1 } },
        });
      }

      // 탈퇴 신청 시점에 자리를 비운다. `withdrawal_pending` 이 되면 가드가 모든 요청을
      // 막으므로 본인은 더 이상 아무것도 할 수 없는데, 대회 로스터와 팀 명단에는 그대로
      // 남아 정원만 차지한다 — 2026-08-03 프로덕션에서 실제로 이렇게 됐다.
      // 완료된 대회는 기록 보존을 위해 건드리지 않는다(roster-cleanup.ts 주석 참조).
      const removedRosterCount = await removeUserFromActiveRosters(tx, user.id, { at: withdrawnAt });

      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'user',
          targetId: user.id,
          fromStatus: current.accountStatus,
          toStatus: 'withdrawal_pending',
          actorType: 'user',
          actorUserId: user.id,
          // 사용자가 사유를 안 적었으면 null 로 둔다. 예전에는 'withdrawal_requested'
          // 를 채웠는데, 이 컬럼은 **사용자가 쓴 문장**을 담는 자리라서 어드민 화면의
          // `reason || '별도 메시지를 남기지 않았어요'` 폴백이 발동하지 못하고 내부
          // 문자열이 그대로 노출됐다. 무슨 일이 있었는지는 toStatus 가 이미 말해준다.
          reason: dto.reason?.trim() || null,
        },
      });
      return { next, removedRosterCount, leftTeamCount: memberships.length };
    });

    if (updated.removedRosterCount > 0 || updated.leftTeamCount > 0) {
      this.logger.log(
        `withdrawal cleanup user=${user.id} rosters=${updated.removedRosterCount} teams=${updated.leftTeamCount}`,
      );
    }

    return {
      userId: updated.next.id,
      accountStatus: updated.next.accountStatus,
      requestedAt: updated.next.updatedAt,
    };
  }

  private async getUserSnapshot(userId: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        reputationSummary: true,
        regions: {
          include: {
            region: {
              include: { parent: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        sportPreferences: {
          include: {
            sport: { select: { id: true, name: true } },
            sportLevel: { select: { id: true, name: true } },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        authIdentities: { where: { status: 'active' }, select: { provider: true, passwordHash: true } },
      },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User was not found' });
    if (user.accountStatus === 'deleted') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Deleted account cannot access profile' });
    }
    return user;
  }

  private assertMutableAccount(user: V1AuthUser) {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot be modified' });
    }
  }

  private async assertWithdrawable(userId: string) {
    const [ongoingMatch, teamAuthority] = await Promise.all([
      this.prisma.v1MatchParticipant.findFirst({
        where: {
          userId,
          status: 'active',
          match: { status: { in: ['recruiting', 'closed'] }, deletedAt: null },
        },
        select: { id: true },
      }),
      this.prisma.v1TeamMembership.findFirst({
        where: {
          userId,
          status: 'active',
          role: { in: ['owner', 'manager'] },
          team: { status: 'active', deletedAt: null },
        },
        select: { id: true },
      }),
    ]);

    if (ongoingMatch) {
      throw new ConflictException({
        code: 'WITHDRAWAL_BLOCKED_ACTIVE_MATCH',
        message: '진행 중인 매치가 있어 탈퇴할 수 없어요. 매치를 종료하거나 나간 뒤 다시 시도해주세요.',
      });
    }
    if (teamAuthority) {
      throw new ConflictException({
        code: 'WITHDRAWAL_BLOCKED_TEAM_AUTHORITY',
        message: '운영 중인 팀이 있어 탈퇴할 수 없어요. 팀 관리 권한을 다른 멤버에게 넘긴 뒤 다시 시도해주세요.',
      });
    }
  }

  private async validateSports(
    sports: Array<{
      sportId: string;
      levelId?: string | null;
      preferredPosition?: string | null;
      secondaryPreferredPosition?: string | null;
    }>,
  ) {
    for (const sport of sports) {
      const activeSport = await this.prisma.v1Sport.findFirst({
        where: { id: sport.sportId, isActive: true },
        select: { id: true, code: true },
      });

      if (!activeSport) {
        throw validationError('Sport is not active or does not exist', 'sports');
      }

      // [D14] 선호 포지션은 **종목별로** 유효 집합이 다르다. 전역 화이트리스트 하나로
      // 처리하면 풋살 유저가 'MF' 를 저장할 수 있고, 그 사람 카드에 풋살엔 없는 자리가
      // 뜬다 -- 사람 축에 저장되는 값이라 경기마다 고칠 기회가 없다.
      //
      // 프리셋이 없는 종목(러닝·수영)은 유효 코드가 0개라 **어떤 값도 통과하지 못한다.**
      // 그건 오류가 아니라 "이 종목엔 포지션 개념이 없다"는 사실이고, 화면도 그 종목엔
      // 선호 포지션 섹션을 띄우지 않는다.
      const positionError = validatePreferredPositions(
        {
          primary: sport.preferredPosition ?? null,
          secondary: sport.secondaryPreferredPosition ?? null,
        },
        positionCodesForSport(activeSport.code, {
          tryNormalize: tryNormalizeCompetitionSportCode,
          canonicalConfig: canonicalCompetitionConfigForSport,
        }),
      );
      if (positionError !== null) {
        throw validationError(PREFERRED_POSITION_MESSAGES[positionError], 'sports.preferredPosition');
      }

      if (sport.levelId) {
        const level = await this.prisma.v1SportLevel.findFirst({
          where: {
            id: sport.levelId,
            sportId: sport.sportId,
            isActive: true,
          },
          select: { id: true },
        });

        if (!level) {
          throw validationError('Level does not belong to the selected active sport', 'sports.levelId');
        }
      }
    }
  }

  private async validateRegions(regionIds: string[]) {
    if (regionIds.length === 0) return;

    const count = await this.prisma.v1Region.count({
      where: {
        id: { in: regionIds },
        isActive: true,
        level: 2,
      },
    });

    if (count !== regionIds.length) {
      throw validationError('Region is not an active district region', 'regions');
    }
  }
}

function validateNoDuplicates(values: string[], field: string) {
  if (new Set(values).size !== values.length) {
    throw validationError(`Duplicate ${field} are not allowed`, field);
  }
}

function validationError(message: string, field: string) {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
    details: { field },
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidBirthDate(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatRegionName(region: { name: string; parent: { name: string } | null }) {
  return region.parent?.name ? `${region.parent.name} ${region.name}` : region.name;
}

function toProfileResponse(user: Awaited<ReturnType<ProfileService['getUserSnapshot']>>) {
  return {
    userId: user.id,
    accountStatus: user.accountStatus,
    email: user.email,
    phone: user.phone,
    authProvider: user.authIdentities[0]?.provider ?? null,
    authProviders: user.authIdentities.map((identity) => identity.provider),
    hasPassword: user.authIdentities.some((identity) => Boolean(identity.passwordHash)),
    onboardingStatus: user.onboardingStatus,
    regionName: formatPrimaryRegion(user.regions),
    sports: user.sportPreferences.map((preference) => ({
      sportId: preference.sport.id,
      sportName: preference.sport.name,
      levelId: preference.sportLevel?.id ?? null,
      levelName: preference.sportLevel?.name ?? null,
      primary: preference.isPrimary,
    })),
    regions: user.regions.map((userRegion) => ({
      regionId: userRegion.region.id,
      regionName: formatRegionName(userRegion.region),
      primary: userRegion.isPrimary,
    })),
    profile: toProfilePayload(user.profile),
    reputation: toReputationPayload(user.reputationSummary),
  };
}

function formatPrimaryRegion(
  regions: Array<{
    region: {
      name: string;
      parent: { name: string } | null;
    };
  }>,
) {
  const primary = regions[0];
  if (!primary) return null;
  return formatRegionName(primary.region);
}

function toProfilePayload(profile: {
  nickname: string;
  displayName: string | null;
  realName: string | null;
  profileImageUrl: string | null;
  birthDate: string | null;
  gender: string | null;
  bio?: string | null;
} | null) {
  return {
    displayName: profile?.nickname ?? '사용자',
    nickname: profile?.nickname ?? null,
    realName: profile?.realName ?? null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    birthDate: profile?.birthDate ?? null,
    gender: normalizeProfileGender(profile?.gender),
    // alpha 실측(2026-08-24)에서 잡은 결함: 저장은 되는데 이 payload 에 bio 가 빠져
    // `GET /me/profile` 과 `PATCH` 응답 모두 값을 안 돌려줬다. 프론트는 그 응답으로
    // 캐시를 갱신하고 편집 폼 초깃값을 채우므로, 저장 직후 편집 화면에 다시 들어가면
    // 방금 쓴 소개가 비어 보였다(DB 엔 남아 있는데).
    bio: profile?.bio ?? null,
  };
}

function normalizeProfileGender(value: string | null | undefined): 'male' | 'female' | null {
  return value === 'male' || value === 'female' ? value : null;
}

function toReputationPayload(reputation: {
  trustState: 'verified' | 'estimated' | 'sample' | 'none';
  mannerScore: unknown;
  reviewCount: number;
} | null) {
  return {
    trustState: reputation?.trustState ?? 'none',
    mannerScore: reputation?.mannerScore ? Number(reputation.mannerScore) : null,
    activityCount: reputation?.reviewCount ?? 0,
    reviewCount: reputation?.reviewCount ?? 0,
  };
}

function toRecordConsentResponse(
  consent: { state: V1ConsentState; effectiveAt: Date } | null,
): { granted: boolean; effectiveAt: string | null } {
  return {
    granted: consent?.state === V1ConsentState.GRANTED,
    effectiveAt: consent ? consent.effectiveAt.toISOString() : null,
  };
}

function toSettingsNotifications(preferences: {
  activityEnabled: boolean;
  matchEnabled?: boolean;
  teamEnabled?: boolean;
  teamMatchEnabled?: boolean;
  chatEnabled?: boolean;
  noticeEnabled?: boolean;
  marketingEnabled: boolean;
}) {
  return {
    matchEnabled: preferences.matchEnabled ?? preferences.activityEnabled,
    teamEnabled: preferences.teamEnabled ?? preferences.activityEnabled,
    teamMatchEnabled: preferences.teamMatchEnabled ?? preferences.activityEnabled,
    chatEnabled: preferences.chatEnabled ?? preferences.activityEnabled,
    noticeEnabled: preferences.noticeEnabled ?? preferences.activityEnabled,
    marketingEnabled: preferences.marketingEnabled,
  };
}

async function writeUserAuditLog(
  tx: Prisma.TransactionClient,
  input: { userId: string; targetType: string; reason: string },
) {
  await tx.v1StatusChangeLog.create({
    data: {
      targetType: input.targetType,
      targetId: input.userId,
      fromStatus: null,
      toStatus: 'updated',
      actorType: 'user',
      actorUserId: input.userId,
      reason: input.reason,
    },
  });
}

function changedFields(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
) {
  return Object.keys(after).filter((key) => (before[key] ?? null) !== (after[key] ?? null));
}
