import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1Tournament } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageInfo, paginationArgs } from '../common/pagination/page-args';
import { V1AuthUser } from '../auth/v1-auth-user';
import { GeocodedCoordinates, KakaoGeocodingService } from './kakao-geocoding.service';
import { isBracketPublished } from './tournament-detail.presenter';
import {
  AdminTournamentListQueryDto,
  ChangeTournamentStatusDto,
  CreateTournamentDto,
  TournamentGenderCategory,
  TournamentStatus,
  UpdateTournamentDto,
} from './dto/admin-tournament.dto';
import { normalizeCompetitionSportCode, tryNormalizeCompetitionSportCode } from './competition-config/competition-config';
import { parseLineupLimits } from './competition-config/competition-config.parse';
import { LineupSizeConfigResolver } from './competition-config/lineup-size-config-resolver';
import { TournamentCompetitionConfig } from './competition-config/tournament-competition-config';

/**
 * 대회 status 전이 규칙. completed/cancelled는 종착(이후 전이 없음).
 * 운영 실수 회복을 위해 closed↔open 재오픈은 허용.
 */
const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['open', 'in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const TOURNAMENT_LIST_STATUSES = ['draft', 'open', 'closed', 'in_progress', 'completed', 'cancelled'] as const;

function nullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class TournamentsAdminService {
  private readonly logger = new Logger(TournamentsAdminService.name);
  private readonly lineupSizeConfigResolver: LineupSizeConfigResolver;
  private readonly tournamentCompetitionConfig: TournamentCompetitionConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly kakaoGeocoding: KakaoGeocodingService,
  ) {
    this.lineupSizeConfigResolver = new LineupSizeConfigResolver(prisma, adminContext);
    this.tournamentCompetitionConfig = new TournamentCompetitionConfig(prisma, adminContext);
  }

  async list(user: V1AuthUser, query: AdminTournamentListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const limit = query.limit ?? 20;

    const statusFacetWhere: Prisma.V1TournamentWhereInput = {
      deletedAt: null,
      ...(query.sportId ? { sportId: query.sportId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const where: Prisma.V1TournamentWhereInput = {
      ...statusFacetWhere,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, statusGroups] = await Promise.all([this.prisma.v1Tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...paginationArgs(query, limit),
      include: { _count: { select: { registrations: true } } },
    }), this.prisma.v1Tournament.groupBy({
      by: ['status'],
      where: statusFacetWhere,
      _count: { _all: true },
    })]);

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    const byStatus = Object.fromEntries(TOURNAMENT_LIST_STATUSES.map((status) => [status, 0])) as Record<
      (typeof TOURNAMENT_LIST_STATUSES)[number],
      number
    >;
    for (const group of statusGroups) byStatus[group.status] = group._count._all;

    // status 필터가 걸리면 그 상태의 건수가, 없으면 전체가 곧 이 목록의 총 건수다.
    // groupBy 는 status 를 제외한 같은 필터로 집계하므로 추가 쿼리 없이 정확하다.
    const total = query.status
      ? byStatus[query.status] ?? 0
      : Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      items: pageItems.map((row) => this.serialize(row, row._count.registrations)),
      pageInfo: buildPageInfo({
        page: query.page,
        limit,
        total,
        hasNext,
        nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null,
      }),
      summary: {
        total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        byStatus,
      },
    };
  }

  async get(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const row = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: {
        _count: { select: { registrations: true, fixtures: true, announcements: true } },
        sport: { select: { code: true } },
      },
    });
    if (!row) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    // row.sport는 스키마상 항상 존재해야 하는 필수 relation(V1Tournament.sportId가
    // required)이지만, 옵셔널 체이닝으로 방어해 둔다 — 이 relation을 모르는(추가 전부터
    // 있던) 다른 테스트의 얕은 목이 undefined를 줘도 loadLineupInfo가 "종목 정보 없음"으로
    // 안전하게 degrade하지, 여기서 크래시하지 않는다.
    const lineup = await this.loadLineupInfo(row.sport?.code, row.competitionConfigVersionId);
    return this.serialize(
      row,
      row._count.registrations,
      {
        registrations: row._count.registrations,
        fixtures: row._count.fixtures,
        announcements: row._count.announcements,
      },
      lineup,
    );
  }

  /**
   * `get()` 전용 — 대회 상세/수정 화면이 "출전 인원"·"교체 방식/횟수" 선택지와 현재
   * pin된 값을 함께 보여주는 데 쓴다. `sportCode`가 경기 설정 카탈로그에 없는 종목이면
   * `sizeOptions`는 빈 배열이고(선택지를 지어내지 않는다), `competitionConfigVersionId`가
   * 아직 null이면 `pinned`도 null이다(아직 어떤 값도 pin되지 않음 — 미지원 종목이거나
   * 레거시 대회).
   */
  private async loadLineupInfo(
    sportCode: string | null | undefined,
    competitionConfigVersionId: string | null,
  ): Promise<{
    pinned: {
      maxPlayers: number;
      minPlayers: number;
      substitutionMode: 'limited' | 'rolling';
      maxSubstitutions: number | null;
    } | null;
    sizeOptions: number[];
    substitutionModes: ReadonlyArray<'limited' | 'rolling'>;
  }> {
    const normalizedSportCode = tryNormalizeCompetitionSportCode(sportCode);
    const sizeOptions = normalizedSportCode
      ? this.lineupSizeConfigResolver.selectableLineupSizesForSportCode(normalizedSportCode)
      : [];
    // 교체 방식은 종목 카탈로그가 없어도(sizeOptions가 빈 배열이어도) 항상 같은 두 값이다
    // (substitution-policy.ts 참고) — 그래도 미지원 종목엔 pin된 값 자체가 없을 것이므로
    // 여기서는 그냥 상수를 그대로 내려준다.
    const substitutionModes = this.lineupSizeConfigResolver.selectableSubstitutionModes();
    if (!competitionConfigVersionId) {
      return { pinned: null, sizeOptions, substitutionModes };
    }
    const config = await this.prisma.v1CompetitionConfigVersion.findUnique({
      where: { id: competitionConfigVersionId },
      select: { lineup: true },
    });
    if (!config) {
      return { pinned: null, sizeOptions, substitutionModes };
    }
    const limits = parseLineupLimits(config.lineup);
    return {
      pinned: {
        maxPlayers: limits.maxPlayers,
        minPlayers: limits.minPlayers,
        substitutionMode: limits.substitutions,
        maxSubstitutions: limits.maxSubstitutions,
      },
      sizeOptions,
      substitutionModes,
    };
  }

  async create(user: V1AuthUser, dto: CreateTournamentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    if (dto.teamCount === undefined) {
      throw new BadRequestException({
        code: 'TOURNAMENT_TEAM_COUNT_REQUIRED',
        message: '참가 팀 수를 입력해 주세요.',
      });
    }
    this.assertPlayerRange(dto.minPlayers, dto.maxPlayers);
    this.assertSubstitutionPolicyPair(dto.substitutionMode, dto.maxSubstitutions);
    this.assertScheduleRange(
      dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null,
    );
    this.assertPaidTournamentPaymentInstructions({
      entryFee: dto.entryFee ?? 0,
      bankName: dto.bankName,
      bankAccount: dto.bankAccount,
      bankHolder: dto.bankHolder,
    });
    const genderQuota = this.normalizeGenderQuota({
      genderCategory: dto.genderCategory,
      genderMinMale: dto.genderMinMale,
      genderMaxMale: dto.genderMaxMale,
      genderMinFemale: dto.genderMinFemale,
      genderMaxFemale: dto.genderMaxFemale,
      maxPlayers: dto.maxPlayers ?? 10,
    });

    const sport = await this.prisma.v1Sport.findUnique({ where: { id: dto.sportId } });
    if (!sport) {
      throw new BadRequestException({ code: 'SPORT_NOT_FOUND', message: '종목을 찾을 수 없어요.' });
    }

    // 지오코딩은 네트워크 호출이라 DB 트랜잭션 밖에서 먼저 수행 — 트랜잭션을 붙잡아두지 않고,
    // 실패해도(키 미설정 포함) venue 저장 자체는 절대 막지 않는다(좌표만 null).
    const coordinates = dto.venue ? await this.geocodeVenueSafe(dto.venue) : null;

    // "출전 인원"(V1CompetitionConfigVersion.lineup.maxPlayers) 을 위 minPlayers/maxPlayers
    // (대회 "등록" 로스터 크기)와 절대 섞지 않는다 — resolveLineupConfigVersionId()가
    // find-or-create로 별도 버전 행을 만들어 tournament.competitionConfigVersionId에만 연결한다.
    // "교체 방식/횟수"도 같은 경로로 함께 pin한다 — 생성 시점엔 기존 pin이 없으므로 생략한
    // 필드는 그대로 canonical 기본값을 쓴다(resolveVersionForLineupConfig 계약). 필드
    // 조합 자체의 유효성(assertSubstitutionPolicyPair)은 위에서 이미 검증했다.
    const competitionConfigVersionId = await this.resolveLineupConfigVersionId(user, sport.code, {
      maxPlayers: dto.lineupMaxPlayers,
      substitutionMode: dto.substitutionMode,
      maxSubstitutions: dto.maxSubstitutions,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.v1Tournament.create({
        data: {
          sportId: dto.sportId,
          title: dto.title,
          competitionConfigVersionId,
          format: dto.format ?? 'group_knockout',
          registrationDeadlineAt: dto.registrationDeadlineAt ? new Date(dto.registrationDeadlineAt) : null,
          rosterDeadlineAt: dto.rosterDeadlineAt ? new Date(dto.rosterDeadlineAt) : null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          scheduledEndAt: dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null,
          venue: dto.venue ?? null,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          coverImageUrl: dto.coverImageUrl ?? null,
          teamCount: dto.teamCount,
          minPlayers: dto.minPlayers ?? 6,
          maxPlayers: dto.maxPlayers ?? 10,
          genderCategory: dto.genderCategory ?? null,
          ...genderQuota,
          entryFee: dto.entryFee ?? 0,
          bankName: dto.bankName ?? null,
          bankAccount: dto.bankAccount ?? null,
          bankHolder: dto.bankHolder ?? null,
          rulesText: dto.rulesText ?? null,
          refundPolicyText: dto.refundPolicyText ?? null,
          prizePool: dto.prizePool ?? null,
          prizeSummary: dto.prizeSummary ?? null,
          prizeBreakdown: dto.prizeBreakdown ?? null,
          promoHomeEnabled: dto.promoHomeEnabled ?? false,
          promoHomeTitle: nullableText(dto.promoHomeTitle) ?? null,
          promoHomeSubtitle: nullableText(dto.promoHomeSubtitle) ?? null,
          promoHomeImageUrl: nullableText(dto.promoHomeImageUrl) ?? null,
          promoHomeBadgeText: nullableText(dto.promoHomeBadgeText) ?? null,
          promoHomeDateText: nullableText(dto.promoHomeDateText) ?? null,
          promoHomeTeamsText: nullableText(dto.promoHomeTeamsText) ?? null,
          promoHomeLocationText: nullableText(dto.promoHomeLocationText) ?? null,
          promoHomePrizeText: nullableText(dto.promoHomePrizeText) ?? null,
          promoHomePriority: dto.promoHomePriority ?? 0,
          promoListEnabled: dto.promoListEnabled ?? false,
          promoListTitle: nullableText(dto.promoListTitle) ?? null,
          promoListSubtitle: nullableText(dto.promoListSubtitle) ?? null,
          promoListImageUrl: nullableText(dto.promoListImageUrl) ?? null,
          promoListBadgeText: nullableText(dto.promoListBadgeText) ?? null,
          promoListDateText: nullableText(dto.promoListDateText) ?? null,
          promoListTeamsText: nullableText(dto.promoListTeamsText) ?? null,
          promoListLocationText: nullableText(dto.promoListLocationText) ?? null,
          promoListPrizeText: nullableText(dto.promoListPrizeText) ?? null,
          promoListPriority: dto.promoListPriority ?? 0,
          createdByAdminUserId: admin.id,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.create',
          targetType: 'tournament',
          targetId: tournament.id,
          afterJson: { title: tournament.title, status: tournament.status },
          toStatus: tournament.status,
        },
        tx,
      );
      return tournament;
    });

    return this.serialize(created, 0);
  }

  async update(user: V1AuthUser, tournamentId: string, dto: UpdateTournamentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    // "출전 인원"과 "교체 방식/횟수"는 같은 V1CompetitionConfigVersion.lineup에 함께
    // pin되는 설정이라 변경 정책도 동일해야 한다(오너 지시 #4) — 아래 게이트를 두
    // 필드군 모두에 공통으로 적용한다.
    const lineupConfigChangeRequested =
      dto.lineupMaxPlayers !== undefined ||
      dto.substitutionMode !== undefined ||
      dto.maxSubstitutions !== undefined;
    this.assertSubstitutionPolicyPair(dto.substitutionMode, dto.maxSubstitutions);
    if (lineupConfigChangeRequested) {
      // 종목과 출전 인원/교체 정책을 한 번에 바꾸면 어느 종목 기준으로 후보를 검증해야
      // 할지(변경 전/후 종목 모두 CAS 창 안에서 유효한 후보 세트가 다르다) 모호해진다 —
      // 두 단계로 나눠 받는다: 종목을 먼저 바꾸고, 그 다음 요청에서 이 설정들을 정한다.
      if (dto.sportId !== undefined && dto.sportId !== existing.sportId) {
        throw new BadRequestException({
          code: 'TOURNAMENT_LINEUP_SIZE_SPORT_CHANGE_CONFLICT',
          message: '종목과 출전 인원·교체 설정은 한 번에 함께 변경할 수 없어요. 종목을 먼저 변경한 뒤 설정해 주세요.',
        });
      }
      // "이미 시작/완료된 대회의 설정 변경은 막는다"(권장안) — 진행 중/종료된 대회의 출전
      // 인원이나 교체 정책을 바꾸면 이미 뛴 경기와 앞으로 뛸 경기가 서로 다른 규칙을 갖게
      // 될 위험이 크다. TournamentCompetitionConfig.change()가 미완료 픽스처만
      // 리포인트하고 완료된 경기는 그대로 두는 것과 같은 원칙을, 여기서는 아예 진입
      // 자체를 막는 더 안전한 쪽으로 적용한다.
      if (existing.status === 'in_progress' || existing.status === 'completed') {
        throw new ConflictException({
          code: 'TOURNAMENT_LINEUP_SIZE_LOCKED',
          message: '대회가 시작된 이후에는 출전 인원·교체 설정을 변경할 수 없어요.',
        });
      }
    }

    // 변경 후 최종 min/max 기준으로 검증(둘 중 하나만 들어와도 일관성 보장).
    const nextMin = dto.minPlayers ?? existing.minPlayers;
    const nextMax = dto.maxPlayers ?? existing.maxPlayers;
    this.assertPlayerRange(nextMin, nextMax);
    const nextGenderCategory =
      dto.genderCategory !== undefined
        ? dto.genderCategory
        : (existing.genderCategory as TournamentGenderCategory | null);
    const genderConfigChanged =
      dto.maxPlayers !== undefined ||
      dto.genderCategory !== undefined ||
      dto.genderMinMale !== undefined ||
      dto.genderMaxMale !== undefined ||
      dto.genderMinFemale !== undefined ||
      dto.genderMaxFemale !== undefined;
    const genderQuota = genderConfigChanged
      ? this.normalizeGenderQuota({
          genderCategory: nextGenderCategory,
          genderMinMale:
            dto.genderMinMale !== undefined ? dto.genderMinMale : existing.genderMinMale,
          genderMaxMale:
            dto.genderMaxMale !== undefined ? dto.genderMaxMale : existing.genderMaxMale,
          genderMinFemale:
            dto.genderMinFemale !== undefined ? dto.genderMinFemale : existing.genderMinFemale,
          genderMaxFemale:
            dto.genderMaxFemale !== undefined ? dto.genderMaxFemale : existing.genderMaxFemale,
          maxPlayers: nextMax,
        })
      : null;
    const nextScheduledAt =
      dto.scheduledAt !== undefined
        ? dto.scheduledAt
          ? new Date(dto.scheduledAt)
          : null
        : existing.scheduledAt;
    const nextScheduledEndAt =
      dto.scheduledEndAt !== undefined
        ? dto.scheduledEndAt
          ? new Date(dto.scheduledEndAt)
          : null
        : existing.scheduledEndAt;
    this.assertScheduleRange(nextScheduledAt, nextScheduledEndAt);
    if (
      dto.entryFee !== undefined ||
      dto.bankName !== undefined ||
      dto.bankAccount !== undefined ||
      dto.bankHolder !== undefined
    ) {
      this.assertPaidTournamentPaymentInstructions({
        entryFee: dto.entryFee ?? existing.entryFee,
        bankName: dto.bankName !== undefined ? dto.bankName : existing.bankName,
        bankAccount: dto.bankAccount !== undefined ? dto.bankAccount : existing.bankAccount,
        bankHolder: dto.bankHolder !== undefined ? dto.bankHolder : existing.bankHolder,
      });
    }

    // 종목 변경: 존재하는 종목인지 검증 후 relation 연결
    if (dto.sportId !== undefined && dto.sportId !== existing.sportId) {
      const sport = await this.prisma.v1Sport.findUnique({ where: { id: dto.sportId } });
      if (!sport) {
        throw new NotFoundException({ code: 'SPORT_NOT_FOUND', message: '종목을 찾을 수 없어요.' });
      }
    }

    // venue가 새로 설정되거나 기존 값과 달라질 때만 재지오코딩(불필요한 외부 호출 방지).
    // 트랜잭션 밖에서 먼저 수행 — 네트워크 호출로 트랜잭션을 붙잡아두지 않는다.
    const venueChanged = dto.venue !== undefined && dto.venue !== existing.venue;
    const coordinates = venueChanged && dto.venue ? await this.geocodeVenueSafe(dto.venue) : null;

    const data: Prisma.V1TournamentUpdateInput = {};
    if (dto.sportId !== undefined) data.sport = { connect: { id: dto.sportId } };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.format !== undefined) data.format = dto.format;
    if (dto.registrationDeadlineAt !== undefined) {
      data.registrationDeadlineAt = dto.registrationDeadlineAt ? new Date(dto.registrationDeadlineAt) : null;
    }
    if (dto.rosterDeadlineAt !== undefined) {
      data.rosterDeadlineAt = dto.rosterDeadlineAt ? new Date(dto.rosterDeadlineAt) : null;
    }
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.scheduledEndAt !== undefined) data.scheduledEndAt = dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null;
    if (dto.venue !== undefined) data.venue = dto.venue;
    if (dto.parkingInfo !== undefined) data.parkingInfo = nullableText(dto.parkingInfo);
    if (venueChanged) {
      data.latitude = coordinates?.latitude ?? null;
      data.longitude = coordinates?.longitude ?? null;
    }
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.teamCount !== undefined) data.teamCount = dto.teamCount;
    if (dto.minPlayers !== undefined) data.minPlayers = dto.minPlayers;
    if (dto.maxPlayers !== undefined) data.maxPlayers = dto.maxPlayers;
    if (dto.genderCategory !== undefined) data.genderCategory = dto.genderCategory;
    if (genderQuota) {
      data.genderMinMale = genderQuota.genderMinMale;
      data.genderMaxMale = genderQuota.genderMaxMale;
      data.genderMinFemale = genderQuota.genderMinFemale;
      data.genderMaxFemale = genderQuota.genderMaxFemale;
    }
    if (dto.entryFee !== undefined) data.entryFee = dto.entryFee;
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.bankAccount !== undefined) data.bankAccount = dto.bankAccount;
    if (dto.bankHolder !== undefined) data.bankHolder = dto.bankHolder;
    if (dto.rulesText !== undefined) data.rulesText = dto.rulesText;
    if (dto.refundPolicyText !== undefined) data.refundPolicyText = dto.refundPolicyText;
    if (dto.prizePool !== undefined) data.prizePool = dto.prizePool;
    if (dto.prizeSummary !== undefined) data.prizeSummary = dto.prizeSummary;
    if (dto.prizeBreakdown !== undefined) data.prizeBreakdown = dto.prizeBreakdown;
    if (dto.promoHomeEnabled !== undefined) data.promoHomeEnabled = dto.promoHomeEnabled;
    if (dto.promoHomeTitle !== undefined) data.promoHomeTitle = nullableText(dto.promoHomeTitle);
    if (dto.promoHomeSubtitle !== undefined) data.promoHomeSubtitle = nullableText(dto.promoHomeSubtitle);
    if (dto.promoHomeImageUrl !== undefined) data.promoHomeImageUrl = nullableText(dto.promoHomeImageUrl);
    if (dto.promoHomeBadgeText !== undefined) data.promoHomeBadgeText = nullableText(dto.promoHomeBadgeText);
    if (dto.promoHomeDateText !== undefined) data.promoHomeDateText = nullableText(dto.promoHomeDateText);
    if (dto.promoHomeTeamsText !== undefined) data.promoHomeTeamsText = nullableText(dto.promoHomeTeamsText);
    if (dto.promoHomeLocationText !== undefined) data.promoHomeLocationText = nullableText(dto.promoHomeLocationText);
    if (dto.promoHomePrizeText !== undefined) data.promoHomePrizeText = nullableText(dto.promoHomePrizeText);
    if (dto.promoHomePriority !== undefined) data.promoHomePriority = dto.promoHomePriority;
    if (dto.promoListEnabled !== undefined) data.promoListEnabled = dto.promoListEnabled;
    if (dto.promoListTitle !== undefined) data.promoListTitle = nullableText(dto.promoListTitle);
    if (dto.promoListSubtitle !== undefined) data.promoListSubtitle = nullableText(dto.promoListSubtitle);
    if (dto.promoListImageUrl !== undefined) data.promoListImageUrl = nullableText(dto.promoListImageUrl);
    if (dto.promoListBadgeText !== undefined) data.promoListBadgeText = nullableText(dto.promoListBadgeText);
    if (dto.promoListDateText !== undefined) data.promoListDateText = nullableText(dto.promoListDateText);
    if (dto.promoListTeamsText !== undefined) data.promoListTeamsText = nullableText(dto.promoListTeamsText);
    if (dto.promoListLocationText !== undefined) data.promoListLocationText = nullableText(dto.promoListLocationText);
    if (dto.promoListPrizeText !== undefined) data.promoListPrizeText = nullableText(dto.promoListPrizeText);
    if (dto.promoListPriority !== undefined) data.promoListPriority = dto.promoListPriority;

    // 출전 인원/교체 정책 변경은 다른 필드들과 별도 트랜잭션으로 처리한다 —
    // TournamentCompetitionConfig.change()가 자기 CAS(expectedVersion)와 미완료 픽스처
    // 리포인트, 감사 로그를 이미 원자적으로 다 갖고 있어 여기서 재구현하지 않는다. CAS는
    // 이 메서드가 시작할 때 읽은 existing.updatedAt을 그대로 쓴다 — 아래 필드 업데이트
    // 트랜잭션이 아직 실행되기 전이라 여전히 유효하다.
    if (lineupConfigChangeRequested) {
      const sport = await this.prisma.v1Sport.findUnique({ where: { id: existing.sportId } });
      if (!sport) {
        throw new NotFoundException({ code: 'SPORT_NOT_FOUND', message: '종목을 찾을 수 없어요.' });
      }
      // 출전 인원/교체 방식/교체 횟수 세 필드 중 이번 요청에 없는 필드는 canonical
      // 기본값이 아니라 "지금 pin된 값"을 그대로 넘겨야 한다 — resolveVersionForLineupConfig는
      // 생략된 override를 canonical로 채우므로, 안 그러면 예를 들어 출전 인원만 바꿀 때
      // 관리자가 이미 골라둔 교체 정책이 조용히 canonical로 리셋된다.
      const pinnedVersion = existing.competitionConfigVersionId
        ? await this.prisma.v1CompetitionConfigVersion.findUnique({
            where: { id: existing.competitionConfigVersionId },
            select: { lineup: true },
          })
        : null;
      const pinnedLineup = pinnedVersion ? parseLineupLimits(pinnedVersion.lineup) : null;
      const resolved = await this.lineupSizeConfigResolver.resolveVersionForLineupConfig(
        user,
        normalizeCompetitionSportCode(sport.code),
        {
          maxPlayers: dto.lineupMaxPlayers ?? pinnedLineup?.maxPlayers,
          substitutionMode: dto.substitutionMode ?? pinnedLineup?.substitutions,
          maxSubstitutions:
            dto.maxSubstitutions !== undefined ? dto.maxSubstitutions : pinnedLineup?.maxSubstitutions,
        },
      );
      if (resolved.id !== existing.competitionConfigVersionId) {
        const changeResult = await this.tournamentCompetitionConfig.change(user, tournamentId, {
          competitionConfigVersionId: resolved.id,
          expectedVersion: existing.updatedAt.toISOString(),
        });
        // change()는 완료된 픽스처/순위가 있어 소급 영향이 있을 때만 confirmationRequired를
        // 반환하며, 그 경우 아무것도 쓰지 않고 그대로 리턴한다(non-mutating). 이 출전 인원
        // 편집 폼에는 confirmRecalculation을 넘길 방법이 없으므로(위 상태 가드가 대부분
        // 걸러내지만, status가 아직 in_progress/completed로 안 바뀐 채로 결과가 먼저 기록된
        // 드문 경우를 대비한 방어) 그대로 진행하는 대신 명확한 에러로 막는다.
        if (changeResult.confirmationRequired) {
          throw new ConflictException({
            code: 'TOURNAMENT_LINEUP_SIZE_LOCKED',
            message: '이미 기록된 경기 결과가 있어 출전 인원을 변경할 수 없어요.',
          });
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.v1Tournament.update({ where: { id: tournamentId }, data });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.update',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: { title: existing.title },
          afterJson: { title: tournament.title },
        },
        tx,
      );
      return tournament;
    });

    return this.get(user, updated.id);
  }

  async changeStatus(user: V1AuthUser, tournamentId: string, dto: ChangeTournamentStatusDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const from = existing.status as TournamentStatus;
    const to = dto.status;
    if (from === to) {
      // 동일 상태 재요청은 멱등 처리(no-op).
      return { tournamentId, previousStatus: from, status: to, alreadyInStatus: true };
    }
    if (!TOURNAMENT_TRANSITIONS[from].includes(to)) {
      throw new ConflictException({
        code: 'TOURNAMENT_STATUS_TRANSITION_INVALID',
        message: `${from} 상태에서 ${to}(으)로 변경할 수 없어요.`,
      });
    }
    if (to === 'open') {
      this.assertPaidTournamentPaymentInstructions(existing);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.v1Tournament.update({ where: { id: tournamentId }, data: { status: to } });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.status',
          targetType: 'tournament',
          targetId: tournamentId,
          reason: dto.reason ?? null,
          fromStatus: from,
          toStatus: to,
        },
        tx,
      );
    });

    return { tournamentId, previousStatus: from, status: to, alreadyInStatus: false };
  }

  /**
   * Task 109 Track 6 — 대진표(조/픽스처) 일괄 공개.
   * 접수마감(registrationDeadlineAt) 이후에만 강제하지는 않는다(운영자 재량으로 조기 공개 허용) —
   * 마감 전 공개 여부 경고는 프론트 확인 모달에서 처리한다. idempotent: 이미 공개된 경우
   * 트랜잭션/로그 없이 alreadyPublished:true 반환.
   *
   * scheduledAt 을 주면 즉시 공개하지 않고 예약만 기록한다. 공개 판정은 스케줄러가 아니라
   * 조회 시점에 `isBracketPublished()` 가 하므로, 예약 시각이 지나는 순간 별도 작업 없이
   * 공개로 전환된다. 이미 지난 시각은 받지 않는다(즉시 공개와 구분되지 않아 혼란스럽다).
   */
  async publishBracket(user: V1AuthUser, tournamentId: string, scheduledAt?: Date) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    // "이미 공개됨"은 조회 시점 판정과 같은 규칙으로 봐야 한다. bracketPublishedAt 만 보면
    // 예약 시각이 지나 이미 공개 중인 대진표에 다시 미래 예약을 걸어 재비공개시키거나,
    // 불필요한 즉시 공개로 공개 시각을 실제보다 늦게 기록하게 된다.
    if (isBracketPublished(existing.bracketPublishedAt, existing.bracketPublishScheduledAt)) {
      return {
        tournamentId,
        bracketPublishedAt: existing.bracketPublishedAt?.toISOString() ?? null,
        bracketPublishScheduledAt: existing.bracketPublishScheduledAt?.toISOString() ?? null,
        alreadyPublished: true,
      };
    }

    if (scheduledAt) {
      return this.scheduleBracketPublish(admin, tournamentId, scheduledAt);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const publishedAt = new Date();
      const transition = await tx.v1Tournament.updateMany({
        where: { id: tournamentId, deletedAt: null, bracketPublishedAt: null },
        data: { bracketPublishedAt: publishedAt, bracketPublishScheduledAt: null },
      });

      if (transition.count === 0) {
        const current = await tx.v1Tournament.findUnique({
          where: { id: tournamentId },
          select: { bracketPublishedAt: true, deletedAt: true },
        });
        if (!current || current.deletedAt) {
          throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
        }
        if (!current.bracketPublishedAt) {
          throw new ConflictException({
            code: 'TOURNAMENT_BRACKET_PUBLISH_CONFLICT',
            message: '대진표 공개 상태가 변경되었어요. 다시 시도해 주세요.',
          });
        }
        return {
          tournamentId,
          bracketPublishedAt: current.bracketPublishedAt.toISOString(),
          bracketPublishScheduledAt: null,
          alreadyPublished: true,
        };
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket_publish',
          targetType: 'tournament',
          targetId: tournamentId,
          afterJson: { bracketPublishedAt: publishedAt.toISOString() },
        },
        tx,
      );

      return {
        tournamentId,
        bracketPublishedAt: publishedAt.toISOString(),
        bracketPublishScheduledAt: null,
        alreadyPublished: false,
      };
    });

    return result;
  }

  /**
   * 예약 공개 기록. 공개 여부 판정은 조회 시점(`isBracketPublished`)이 하므로 여기서는
   * 시각만 저장한다. 같은 엔드포인트를 다시 호출하면 예약 시각이 덮어써진다(변경 = 재예약).
   */
  private async scheduleBracketPublish(
    admin: Awaited<ReturnType<AdminContextService['getMutationAdmin']>>,
    tournamentId: string,
    scheduledAt: Date,
  ) {
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'TOURNAMENT_BRACKET_PUBLISH_SCHEDULE_PAST',
        message: '공개 예약 시각은 현재 시각 이후여야 해요.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const transition = await tx.v1Tournament.updateMany({
        // 아직 공개 전일 때만 예약을 쓴다. bracketPublishedAt 만 검사하면, 예약 시각이
        // 막 지나 공개로 간주되는 순간에 레이스로 예약을 미래로 덮어써서 공개된 대진표가
        // 다시 감춰진다. "예약이 없거나 아직 오지 않았을 때"까지 조건에 넣는다.
        where: {
          id: tournamentId,
          deletedAt: null,
          bracketPublishedAt: null,
          OR: [{ bracketPublishScheduledAt: null }, { bracketPublishScheduledAt: { gt: now } }],
        },
        data: { bracketPublishScheduledAt: scheduledAt },
      });

      if (transition.count === 0) {
        // 예약을 거는 사이 다른 관리자가 즉시 공개했거나, 기존 예약 시각이 지나 공개된 상태.
        const current = await tx.v1Tournament.findUnique({
          where: { id: tournamentId },
          select: { bracketPublishedAt: true, deletedAt: true },
        });
        if (!current || current.deletedAt) {
          throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
        }
        throw new ConflictException({
          code: 'TOURNAMENT_BRACKET_ALREADY_PUBLISHED',
          message: '이미 공개된 대진표예요. 예약할 수 없어요.',
        });
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket_publish_schedule',
          targetType: 'tournament',
          targetId: tournamentId,
          afterJson: { bracketPublishScheduledAt: scheduledAt.toISOString() },
        },
        tx,
      );

      return {
        tournamentId,
        bracketPublishedAt: null,
        bracketPublishScheduledAt: scheduledAt.toISOString(),
        alreadyPublished: false,
      };
    });
  }

  /**
   * 대진표 공개 취소 — 즉시 공개분과 예약분을 모두 되돌린다. 이미 대진표를 본 참가자에게서
   * 기억을 되돌릴 수는 없으므로, 되돌릴 수 없다는 경고는 프론트 확인 모달이 담당한다.
   * idempotent: 이미 비공개면 트랜잭션/로그 없이 alreadyUnpublished:true 반환.
   */
  async unpublishBracket(user: V1AuthUser, tournamentId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { bracketPublishedAt: true, bracketPublishScheduledAt: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    if (!existing.bracketPublishedAt && !existing.bracketPublishScheduledAt) {
      return { tournamentId, bracketPublishedAt: null, bracketPublishScheduledAt: null, alreadyUnpublished: true };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.v1Tournament.updateMany({
        where: { id: tournamentId, deletedAt: null },
        data: { bracketPublishedAt: null, bracketPublishScheduledAt: null },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket_unpublish',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: {
            bracketPublishedAt: existing.bracketPublishedAt?.toISOString() ?? null,
            bracketPublishScheduledAt: existing.bracketPublishScheduledAt?.toISOString() ?? null,
          },
          afterJson: { bracketPublishedAt: null, bracketPublishScheduledAt: null },
        },
        tx,
      );

      return { tournamentId, bracketPublishedAt: null, bracketPublishScheduledAt: null, alreadyUnpublished: false };
    });
  }

  /**
   * KakaoGeocodingService.geocode()는 이미 내부에서 모든 실패(키 미설정/네트워크
   * 오류/응답 이상)를 잡아 null을 반환하지만, 여기서도 한 번 더 방어한다 —
   * 지오코딩 실패가 venue 저장(대회 생성/수정) 자체를 절대 막아서는 안 된다.
   */
  private async geocodeVenueSafe(venue: string): Promise<GeocodedCoordinates | null> {
    try {
      return await this.kakaoGeocoding.geocode(venue);
    } catch (err) {
      this.logger.warn(`Venue geocoding failed for "${venue}" — saving venue without coordinates: ${err}`);
      return null;
    }
  }

  /**
   * 대회 생성 시 "출전 인원"의 V1CompetitionConfigVersion을 find-or-create로 정한다.
   *
   * - `lineupMaxPlayers`를 명시했는데 그 종목이 아직 경기 설정 카탈로그에 없으면(football/
   *   futsal 둘뿐, `normalizeCompetitionSportCode` 참고) 진짜 사용자 오류이므로 그대로
   *   던진다 — 관리자가 지원 안 되는 종목에 출전 인원을 지정하려 한 것.
   * - 생략했고 그 종목도 카탈로그에 없으면 조용히 null을 돌려준다 — 오늘 이 배포 이전과
   *   동일한 동작(그 종목은 애초에 competitionConfigVersionId를 전혀 안 쓴다)을 그대로
   *   유지하는 의도적 분기다(`tryNormalizeCompetitionSportCode`의 non-throwing 결과를
   *   직접 분기하는 것이라 예상 못 한 에러를 삼키는 catch가 아니다).
   * - 생략했지만 카탈로그에 있는 종목이면 canonical 기본값(football 11명/futsal 6명)으로
   *   자동 설정한다 — 이렇게 해야 새 대회가 대진(픽스처) 생성 단계에서
   *   COMPETITION_CONFIG_REQUIRED로 막히는 기존 운영 공백이 사라진다
   *   (tournament-bracket.service.ts#createFixture 참고).
   */
  private async resolveLineupConfigVersionId(
    user: V1AuthUser,
    sportCode: string | null | undefined,
    overrides: {
      maxPlayers?: number;
      substitutionMode?: 'limited' | 'rolling';
      maxSubstitutions?: number | null;
    },
  ): Promise<string | null> {
    const normalizedSportCode = tryNormalizeCompetitionSportCode(sportCode);
    const anyOverrideGiven =
      overrides.maxPlayers !== undefined ||
      overrides.substitutionMode !== undefined ||
      overrides.maxSubstitutions !== undefined;
    if (normalizedSportCode === null) {
      // 관리자가 명시적으로 출전 인원/교체 정책을 지정했는데 종목이 카탈로그에 없다면
      // 진짜 오류다 — normalizeCompetitionSportCode()의 표준 에러
      // (MISSING_SPORT/UNSUPPORTED_SPORT)를 그대로 던져서 관리자에게 이유를 보여준다.
      // 아무것도 안 줬을 때만 null로 조용히 넘어간다.
      if (anyOverrideGiven) normalizeCompetitionSportCode(sportCode);
      return null;
    }
    const resolved = await this.lineupSizeConfigResolver.resolveVersionForLineupConfig(
      user,
      normalizedSportCode,
      overrides,
    );
    return resolved.id;
  }

  /**
   * `substitutionMode`/`maxSubstitutions`를 하나만 주는 조합을 여기서 먼저 막는다 —
   * 특히 "무제한으로 바꾸면서 개수도 같이 남기는" 입력을 조용히 무시하지 않고 명시적으로
   * 거절한다(개수는 'limited'일 때만 의미가 있다). 'limited' + 개수 누락은
   * LineupSizeConfigResolver가 canonical 기본값으로 채워줄 수 있는 경우(생성 시)와
   * 못 채우는 경우(수정 시, canonical이 rolling인 종목)가 갈려서 여기서는 막지 않는다 —
   * resolveVersionForLineupConfig의 SUBSTITUTION_LIMIT_REQUIRED가 그 판단을 맡는다.
   */
  private assertSubstitutionPolicyPair(
    substitutionMode: 'limited' | 'rolling' | undefined,
    maxSubstitutions: number | null | undefined,
  ) {
    if (substitutionMode === 'rolling' && maxSubstitutions !== undefined && maxSubstitutions !== null) {
      throw new BadRequestException({
        code: 'TOURNAMENT_SUBSTITUTION_POLICY_INVALID',
        message: '무제한 교체는 허용 횟수를 함께 지정할 수 없어요.',
      });
    }
    // 'limited' + 명시적 null 은 여기서 막는다. 리졸버까지 내려가면 그 계층은 이 입력을
    // "이미 pin된 레거시 설정(개수 없는 limited)을 그대로 이어받는 중"과 구분할 수 없어
    // 통과시키고, 결과적으로 "제한형인데 상한 없음"(= 사실상 무제한)이 저장돼 관리자가
    // 건 교체 횟수 제한이 조용히 무력화된다. 의도를 아는 곳은 dto 를 보는 여기뿐이다.
    // (개수를 아예 생략한 undefined 는 그대로 리졸버로 흘린다 — 생성 시 canonical
    // 기본값으로 채워지는 정상 경로이고, 못 채우면 SUBSTITUTION_LIMIT_REQUIRED 가 난다.)
    if (substitutionMode === 'limited' && maxSubstitutions === null) {
      throw new BadRequestException({
        code: 'TOURNAMENT_SUBSTITUTION_POLICY_INVALID',
        message: '교체 횟수를 제한하려면 허용 횟수를 함께 입력해 주세요.',
      });
    }
  }

  private assertPlayerRange(min: number | undefined, max: number | undefined) {
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException({
        code: 'TOURNAMENT_PLAYER_RANGE_INVALID',
        message: '최소 선수 수는 최대 선수 수보다 클 수 없어요.',
      });
    }
  }

  private assertPaidTournamentPaymentInstructions(input: {
    entryFee: number;
    bankName?: string | null;
    bankAccount?: string | null;
    bankHolder?: string | null;
  }) {
    if (input.entryFee <= 0) return;
    if (
      !input.bankName?.trim() ||
      !input.bankAccount?.trim() ||
      !input.bankHolder?.trim()
    ) {
      throw new BadRequestException({
        code: 'TOURNAMENT_PAYMENT_INSTRUCTIONS_REQUIRED',
        message: '유료 대회는 은행명, 계좌번호, 예금주를 모두 입력해야 해요.',
      });
    }
  }

  private normalizeGenderQuota(input: {
    genderCategory?: TournamentGenderCategory | null;
    genderMinMale?: number | null;
    genderMaxMale?: number | null;
    genderMinFemale?: number | null;
    genderMaxFemale?: number | null;
    maxPlayers: number;
  }) {
    if (input.genderCategory !== 'mixed') {
      return {
        genderMinMale: null,
        genderMaxMale: null,
        genderMinFemale: null,
        genderMaxFemale: null,
      };
    }

    const quota = {
      genderMinMale: input.genderMinMale ?? null,
      genderMaxMale: input.genderMaxMale ?? null,
      genderMinFemale: input.genderMinFemale ?? null,
      genderMaxFemale: input.genderMaxFemale ?? null,
    };
    const invalidRange =
      (quota.genderMinMale !== null &&
        quota.genderMaxMale !== null &&
        quota.genderMinMale > quota.genderMaxMale) ||
      (quota.genderMinFemale !== null &&
        quota.genderMaxFemale !== null &&
        quota.genderMinFemale > quota.genderMaxFemale);
    const minimumTotal = (quota.genderMinMale ?? 0) + (quota.genderMinFemale ?? 0);
    const maximumExceedsRoster =
      (quota.genderMaxMale !== null && quota.genderMaxMale > input.maxPlayers) ||
      (quota.genderMaxFemale !== null && quota.genderMaxFemale > input.maxPlayers);

    if (invalidRange || minimumTotal > input.maxPlayers || maximumExceedsRoster) {
      throw new BadRequestException({
        code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID',
        message: invalidRange
          ? '성별 최소 인원은 최대 인원보다 클 수 없어요.'
          : maximumExceedsRoster
            ? '성별 최대 인원은 대회 최대 선수 수를 넘을 수 없어요.'
            : '성별 최소 인원 합이 대회 최대 선수 수를 넘을 수 없어요.',
      });
    }

    return quota;
  }

  private assertScheduleRange(start: Date | null, end: Date | null) {
    if (!end) return;
    if (!start || end.getTime() < start.getTime()) {
      throw new BadRequestException({
        code: 'TOURNAMENT_SCHEDULE_RANGE_INVALID',
        message: '대회 종료 일시는 시작 일시 이후여야 해요.',
      });
    }
  }

  private serialize(
    row: V1Tournament,
    registrationCount: number,
    operationCounts?: { registrations: number; fixtures: number; announcements: number },
    lineup?: {
      pinned: {
        maxPlayers: number;
        minPlayers: number;
        substitutionMode: 'limited' | 'rolling';
        maxSubstitutions: number | null;
      } | null;
      sizeOptions: number[];
      substitutionModes: ReadonlyArray<'limited' | 'rolling'>;
    },
  ) {
    return {
      id: row.id,
      sportId: row.sportId,
      title: row.title,
      status: row.status,
      format: row.format,
      registrationDeadlineAt: row.registrationDeadlineAt?.toISOString() ?? null,
      rosterDeadlineAt: row.rosterDeadlineAt?.toISOString() ?? null,
      bracketPublishedAt: row.bracketPublishedAt?.toISOString() ?? null,
      bracketPublishScheduledAt: row.bracketPublishScheduledAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
      venue: row.venue,
      parkingInfo: row.parkingInfo,
      latitude: row.latitude,
      longitude: row.longitude,
      coverImageUrl: row.coverImageUrl,
      teamCount: row.teamCount,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      // "출전 인원"(라인업 상한) — 위 minPlayers/maxPlayers("등록" 로스터 크기)와는 다른
      // 값이다. competitionConfigVersionId는 목록/생성 응답에도 항상 있는 스칼라라 비용
      // 없이 노출하지만, lineupMaxPlayers/lineupMinPlayers/lineupSizeOptions는 조인이
      // 필요해 get()(대회 상세·수정 화면)에서만 채운다 — 그 외에는 null/[]로 둔다.
      competitionConfigVersionId: row.competitionConfigVersionId,
      lineupMaxPlayers: lineup?.pinned?.maxPlayers ?? null,
      lineupMinPlayers: lineup?.pinned?.minPlayers ?? null,
      lineupSizeOptions: lineup?.sizeOptions ?? [],
      // "교체 방식/횟수" — 위 lineupMaxPlayers와 같은 V1CompetitionConfigVersion.lineup에
      // 함께 저장되지만 다른 관심사(경기 중 후보→주전 교체를 몇 번까지 허용할지)다.
      // pin된 값이 없으면(미지원 종목/레거시 대회) 둘 다 null.
      substitutionMode: lineup?.pinned?.substitutionMode ?? null,
      maxSubstitutions: lineup?.pinned?.maxSubstitutions ?? null,
      substitutionModeOptions: lineup?.substitutionModes ?? [],
      genderCategory: row.genderCategory,
      genderMinMale: row.genderMinMale,
      genderMaxMale: row.genderMaxMale,
      genderMinFemale: row.genderMinFemale,
      genderMaxFemale: row.genderMaxFemale,
      entryFee: row.entryFee,
      bankName: row.bankName,
      bankAccount: row.bankAccount,
      bankHolder: row.bankHolder,
      rulesText: row.rulesText,
      refundPolicyText: row.refundPolicyText,
      prizePool: row.prizePool,
      prizeSummary: row.prizeSummary,
      prizeBreakdown: row.prizeBreakdown,
      promoHomeEnabled: row.promoHomeEnabled,
      promoHomeTitle: row.promoHomeTitle,
      promoHomeSubtitle: row.promoHomeSubtitle,
      promoHomeImageUrl: row.promoHomeImageUrl,
      promoHomeBadgeText: row.promoHomeBadgeText,
      promoHomeDateText: row.promoHomeDateText,
      promoHomeTeamsText: row.promoHomeTeamsText,
      promoHomeLocationText: row.promoHomeLocationText,
      promoHomePrizeText: row.promoHomePrizeText,
      promoHomePriority: row.promoHomePriority,
      promoListEnabled: row.promoListEnabled,
      promoListTitle: row.promoListTitle,
      promoListSubtitle: row.promoListSubtitle,
      promoListImageUrl: row.promoListImageUrl,
      promoListBadgeText: row.promoListBadgeText,
      promoListDateText: row.promoListDateText,
      promoListTeamsText: row.promoListTeamsText,
      promoListLocationText: row.promoListLocationText,
      promoListPrizeText: row.promoListPrizeText,
      promoListPriority: row.promoListPriority,
      registrationCount,
      ...(operationCounts ? { operationCounts } : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
