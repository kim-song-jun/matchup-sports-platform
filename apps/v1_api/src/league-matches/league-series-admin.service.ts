import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaAvailabilityError } from '../common/prisma-availability-error';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { LeagueMatchPublicService } from './league-match-public.service';
import { findInactivePromotionTeamIds, findUnfinishedSeasonLeagues, planNextSeasonTiers } from './league-lifecycle-rules';
import {
  calculatePromotions,
  promotionRuleFingerprint,
  resolvePromotionRule,
  validatePromotionRule,
  DEFAULT_PROMOTION_RULE,
  type PromotionKind,
  type PromotionRule,
  type TierStandingsInput,
} from './league-promotion';
import type { StandingsTieGroup } from './league-standings';
import {
  CommitPromotionsDto,
  CreateLeagueSeriesDto,
  SeedSeasonDto,
  UpdateLeagueSeriesDto,
} from './dto/league-series.dto';
import { createLeagueRosterRegistration } from './league-team-admission';
import { tierLabel } from './league-tier-label';
import {
  leagueMirrorCreateData,
  toMirrorSource,
} from '../tournaments/league-competition-mirror';
import { createLeagueMirrorWithRosterSchedule } from '../jobs/league-roster/league-roster-autoconfirm.service';

const DEFAULT_TIE_BREAK_ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;
const SEASON_LENGTH_FALLBACK_DAYS = 90;

@Injectable()
export class LeagueSeriesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly publicService: LeagueMatchPublicService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertRuleValid(rule: PromotionRule): void {
    const errors = validatePromotionRule(rule);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_PROMOTION_RULE_INVALID',
        message: `승강 규칙이 올바르지 않아요. ${errors.map((e) => e.message).join(' ')}`,
        details: { errors },
      });
    }
  }

  async create(user: V1AuthUser, dto: CreateLeagueSeriesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const rule: PromotionRule = dto.promotionRule ?? { ...DEFAULT_PROMOTION_RULE };
    this.assertRuleValid(rule);

    // 리그(V1League) 생성과 달리 시리즈에는 팀이 딸려 오지 않는다 — 팀의 sportId 와 대조해
    // 간접 검증되던 경로가 없으므로 종목도 직접 확인한다. 안 하면 FK 위반이 500 으로 샌다.
    const sport = await this.prisma.v1Sport.findFirst({
      where: { id: dto.sportId, isActive: true },
      select: { id: true },
    });
    if (sport === null) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_SPORT_INVALID',
        message: '활성화된 종목만 선택할 수 있어요.',
      });
    }

    const region = await this.prisma.v1Region.findFirst({
      where: { id: dto.regionId, isActive: true, level: 2 },
      select: { id: true },
    });
    if (region === null) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_REGION_INVALID',
        message: '활성화된 시·군·구 지역만 선택할 수 있어요.',
      });
    }

    const series = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1LeagueSeries.create({
        data: {
          title: dto.title,
          sportId: dto.sportId,
          regionId: dto.regionId,
          createdByAdminUserId: admin.id,
          tierCount: dto.tierCount,
          promotionRuleJson: rule as object,
        },
      });
      await this.adminContext.logAdminAction(admin, {
        action: 'league_series.create',
        targetType: 'league_series',
        targetId: created.id,
      }, tx);
      return created;
    });

    return this.serializeSeries(series);
  }

  async update(user: V1AuthUser, seriesId: string, dto: UpdateLeagueSeriesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const series = await this.loadSeries(seriesId);

    if (dto.promotionRule !== undefined) this.assertRuleValid(dto.promotionRule);

    // 티어 수를 줄이면 이미 만들어진 그 티어의 리그가 고아가 된다 — 먼저 막는다.
    if (dto.tierCount !== undefined && dto.tierCount < series.tierCount) {
      const orphaned = await this.prisma.v1League.count({
        where: { seriesId, tier: { gt: dto.tierCount } },
      });
      if (orphaned > 0) {
        throw new ConflictException({
          code: 'LEAGUE_SERIES_TIER_IN_USE',
          message: `이미 ${series.tierCount}부까지 리그가 만들어져 있어서 티어 수를 줄일 수 없어요.`,
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.v1LeagueSeries.update({
        where: { id: seriesId },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.tierCount === undefined ? {} : { tierCount: dto.tierCount }),
          ...(dto.promotionRule === undefined ? {} : { promotionRuleJson: dto.promotionRule as object }),
        },
      });
      await this.adminContext.logAdminAction(admin, {
        action: 'league_series.update',
        targetType: 'league_series',
        targetId: seriesId,
      }, tx);
      return next;
    });

    return this.serializeSeries(updated);
  }

  async list(user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    const rows = await this.prisma.v1LeagueSeries.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sport: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        _count: { select: { leagues: true } },
      },
    });
    // 목록 응답은 배열이 아니라 { items } 로 감싼다 — 이 저장소의 다른 어드민 목록 API
    // (admin/league-matches 등)와 같은 형태이고, 프론트 훅도 data.items 를 읽는다.
    // 배열을 그대로 돌려주면 타입은 통과하지만(제네릭은 런타임을 검증하지 않는다) 화면은
    // 영원히 "아직 리그 체계가 없어요"만 띄운다 — alpha 실화면 캡처로 잡은 결함이다.
    return {
      items: rows.map((row) => ({
        ...this.serializeSeries(row),
        sport: row.sport,
        region: row.region,
        leagueCount: row._count.leagues,
      })),
    };
  }

  async detail(user: V1AuthUser, seriesId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const series = await this.loadSeries(seriesId);
    const leagues = await this.prisma.v1League.findMany({
      where: { seriesId },
      orderBy: [{ seasonNo: 'desc' }, { tier: 'asc' }],
      select: {
        id: true,
        title: true,
        tier: true,
        seasonNo: true,
        state: true,
        startsOn: true,
        endsOn: true,
        _count: { select: { teams: true } },
      },
    });

    return {
      ...this.serializeSeries(series),
      seasons: this.groupBySeason(leagues),
    };
  }

  /**
   * 시즌 1 시딩. 1시즌차에는 승강 이력이 없으므로 어드민이 티어별 팀을 직접 배정한다
   * (ELO 자동 시딩은 참가 이력이 쌓인 뒤 별도 과제).
   */
  async seedSeason(user: V1AuthUser, seriesId: string, dto: SeedSeasonDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const series = await this.loadSeries(seriesId);

    const existing = await this.prisma.v1League.count({ where: { seriesId } });
    if (existing > 0) {
      throw new ConflictException({
        code: 'LEAGUE_SERIES_ALREADY_SEEDED',
        message: '이미 시즌이 만들어진 리그 체계예요. 승강 확정으로 다음 시즌을 만들어 주세요.',
      });
    }

    const tiers = [...dto.tiers].sort((a, b) => a.tier - b.tier);
    if (tiers.length === 0 || tiers.some((t) => t.tier > series.tierCount)) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_SERIES_TIER_INVALID',
        message: `이 리그 체계는 ${series.tierCount}부까지만 있어요.`,
      });
    }
    if (new Set(tiers.map((t) => t.tier)).size !== tiers.length) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_SERIES_TIER_INVALID',
        message: '같은 티어를 두 번 배정할 수 없어요.',
      });
    }

    const allTeamIds = tiers.flatMap((t) => t.teamIds);
    if (new Set(allTeamIds).size !== allTeamIds.length) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '한 팀을 두 티어에 동시에 배정할 수 없어요.',
      });
    }
    for (const tier of tiers) {
      if (new Set(tier.teamIds).size < 2) {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_TEAM_INVALID',
          message: `${tierLabel(tier.tier)}에 서로 다른 팀이 2개 이상 필요해요.`,
        });
      }
    }

    const teams = await this.prisma.v1Team.findMany({
      where: { id: { in: allTeamIds }, status: 'active', deletedAt: null },
      select: { id: true, sportId: true },
    });
    if (teams.length !== allTeamIds.length || teams.some((team) => team.sportId !== series.sportId)) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그 종목과 일치하는 활성 팀만 등록할 수 있어요.',
      });
    }

    // 운영자가 기간을 주면 그것을 쓰고, 없으면 종래 폴백(오늘 + 90일)을 유지한다.
    // 이후 시즌은 commitPromotions 가 직전 시즌 길이를 승계하므로 여기서 정한 기간이
    // 시리즈 전체의 시즌 리듬이 된다.
    //
    // 한쪽만 오면 거부한다. endsOn 만 오면 startsOn 이 조용히 "오늘"로 채워져 운영자가
    // 의도하지 않은 기간이 만들어지는데, 그 리듬을 다음 시즌들이 그대로 승계한다.
    // 프론트도 같은 조건으로 막지만 그건 서버 보장이 아니다.
    if ((dto.startsOn === undefined) !== (dto.endsOn === undefined)) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_PERIOD_INVALID',
        message: '시즌 시작일과 종료일은 함께 입력하거나 함께 비워 주세요.',
      });
    }
    const startsOn = dto.startsOn === undefined ? new Date() : new Date(dto.startsOn);
    const endsOn =
      dto.endsOn === undefined
        ? new Date(startsOn.getTime() + SEASON_LENGTH_FALLBACK_DAYS * 24 * 60 * 60 * 1000)
        : new Date(dto.endsOn);
    if (endsOn.getTime() < startsOn.getTime()) {
      // 단발 리그 생성(LeagueMatchAdminService.create)과 같은 코드·문구를 쓴다 —
      // 같은 실수에 서로 다른 에러가 나오면 운영자가 두 경로를 다른 기능으로 오해한다.
      throw new UnprocessableEntityException({
        code: 'LEAGUE_PERIOD_INVALID',
        message: '종료일은 시작일보다 빠를 수 없어요.',
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // **응답에 나갈 것만 담는다.** dual-write 때문에 아래 `create` 를 `select` 에서
      // `include` 로 넓혔는데(거울에 `sport.code` 가 필요하다), 그 행을 그대로 반환하면
      // **읽기 계약이 조용히 커진다** — 이 엔드포인트가 줄 생각이 없던 컬럼까지 나간다.
      // 쓰기를 고치려고 넓힌 읽기가 밖으로 새는 모양이라, 넓게 읽되 **응답은 좁게** 만든다.
      const leagues: Array<{
        id: string;
        title: string;
        tier: number | null;
        seasonNo: number | null;
        state: string;
      }> = [];
      for (const tier of tiers) {
        const league = await tx.v1League.create({
            data: {
              title: tier.title,
              sportId: series.sportId,
              regionId: series.regionId,
              createdByAdminUserId: admin.id,
              startsOn,
              endsOn,
              tieBreakJson: { order: DEFAULT_TIE_BREAK_ORDER },
              seriesId,
              tier: tier.tier,
              seasonNo: 1,
              teams: { createMany: { data: [...new Set(tier.teamIds)].map((teamId) => ({ teamId })) } },
            },
            include: { sport: { select: { code: true } } },
        });
        // dual-write — 통합 축에 같은 리그를 비춘다(같은 트랜잭션).
        await createLeagueMirrorWithRosterSchedule(tx, leagueMirrorCreateData(toMirrorSource(league)), {
          leagueId: league.id,
          startsOn,
        });
        // 로스터와 짝이 되는 confirmed 등록. 거울을 만든 **뒤**여야 한다 — 등록의
        // tournamentId 가 거울 행을 가리키므로 순서가 바뀌면 FK 로 막힌다.
        for (const teamId of new Set(tier.teamIds)) {
          await createLeagueRosterRegistration(tx, {
            leagueId: league.id,
            teamId,
            entrySource: 'seeded',
          });
        }
        leagues.push({
          id: league.id,
          title: league.title,
          tier: league.tier,
          seasonNo: league.seasonNo,
          state: league.state,
        });
      }
      await tx.v1LeagueSeries.update({ where: { id: seriesId }, data: { state: 'active' } });
      await this.adminContext.logAdminAction(admin, {
        action: 'league_series.seed_season',
        targetType: 'league_series',
        targetId: seriesId,
      }, tx);
      return leagues;
    });

    return { seriesId, seasonNo: 1, leagues: created };
  }

  /**
   * 승강 후보 계산 (dry-run). DB 를 바꾸지 않는다.
   * 어드민이 이 결과를 개별 수정한 뒤 commit 으로 최종 승인해야 반영된다.
   */
  async previewPromotions(user: V1AuthUser, seriesId: string, seasonNo: number) {
    await this.adminContext.getActiveAdmin(user.id);
    const series = await this.loadSeries(seriesId);
    const { tiers, teamNameById } = await this.loadSeasonStandings(seriesId, seasonNo);

    const plan = calculatePromotions({
      tierCount: series.tierCount,
      rule: this.ruleOf(series),
      tiers: tiers.map((t) => t.input),
    });

    const alreadyDecided = await this.prisma.v1LeaguePromotion.count({
      where: { fromLeagueId: { in: tiers.map((t) => t.leagueId) } },
    });

    return {
      seriesId,
      seasonNo,
      rule: this.ruleOf(series),
      // 이 preview 를 만들어 낸 규칙 + 티어 수의 지문. commit 이 그대로 되돌려 보내면 서버가
      // 그 사이 규칙이나 티어 수가 바뀌었는지 판정한다(Task 72 participantHash 와 같은 패턴).
      // tierCount 를 함께 넘기는 이유는 promotionRuleFingerprint 의 doc comment 참고.
      ruleFingerprint: promotionRuleFingerprint(this.ruleOf(series), series.tierCount),
      alreadyDecided: alreadyDecided > 0,
      warnings: plan.warnings,
      tiers: plan.tiers.map((tier) => {
        const source = tiers.find((t) => t.input.tier === tier.tier);
        return {
          tier: tier.tier,
          tierLabel: tierLabel(tier.tier),
          leagueId: source?.leagueId ?? null,
          teamCount: tier.teamCount,
          promoteCount: tier.promoteCount,
          relegateCount: tier.relegateCount,
          skippedByMajorityGuard: tier.skippedByMajorityGuard,
          nextSeasonTeamCount: tier.nextSeasonTeamCount,
          // 감사 H-5 추가분 — 이 티어에서 tie-break 기준을 전부 소진하고 팀ID 사전순
          // 폴백으로 순위가 갈린 팀들. 없으면 빈 배열(정상 — 대부분의 시즌은 여기 안 걸린다).
          // 운영자가 "왜 이 팀이 강등인지" 순위표만으로 설명 못 하는 유일한 경우다.
          tieBreakGroups: (source?.tieBreakGroups ?? []).map((group) => ({
            teamIds: group.teamIds,
            teamNames: group.teamIds.map((teamId) => teamNameById.get(teamId) ?? ''),
          })),
          entries: tier.entries.map((entry) => ({
            ...entry,
            teamName: teamNameById.get(entry.teamId) ?? '',
            toTierLabel: tierLabel(entry.toTier),
          })),
        };
      }),
    };
  }

  /**
   * 최종 승인. 어드민이 수정한 결정을 저장하고 다음 시즌 리그·참가팀을 만든다.
   *
   * 클라이언트가 보낸 kind 를 그대로 믿지 않는다 — computedKind 는 반드시 서버가 다시
   * 계산한 값을 쓰고, 둘이 다를 때만 overriddenByAdmin 을 세운다.
   */
  async commitPromotions(user: V1AuthUser, seriesId: string, seasonNo: number, dto: CommitPromotionsDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const series = await this.loadSeries(seriesId);
    const { tiers, leagueByTier, teamNameById } = await this.loadSeasonStandings(seriesId, seasonNo);

    const decided = await this.prisma.v1LeaguePromotion.findFirst({
      where: { fromLeagueId: { in: tiers.map((t) => t.leagueId) } },
      select: { fromLeagueId: true },
    });
    if (decided !== null) {
      throw new ConflictException({
        code: 'PROMOTION_ALREADY_DECIDED',
        message: '이미 승강이 확정된 시즌이에요.',
      });
    }

    // league-match-dispute.service.ts의 resolveDispute는 "승강이 이미 확정된 리그의
    // 이의는 수락할 수 없다"고 대칭적으로 막는다 — 그 가드만 있고 여기가 비어 있으면,
    // 열린 이의가 있는 상태에서 운영자가 먼저 승강을 확정해 버릴 수 있고, 그 뒤 그
    // 이의는 resolveDispute 가드에 걸려 영원히 처리(수락)가 불가능한 409 교착에 빠진다.
    // 이의를 먼저 처리(수락/거부)하게 하면 순위표와 승강 결정이 항상 같은 시점의
    // 결과를 기준으로 확정된다.
    const openDispute = await this.prisma.v1LeagueMatchDispute.findFirst({
      where: { leagueId: { in: tiers.map((t) => t.leagueId) }, status: 'open' },
      select: { id: true },
    });
    if (openDispute !== null) {
      throw new ConflictException({
        code: 'LEAGUE_RESULT_DISPUTE_OPEN',
        message: '처리되지 않은 이의가 있어요. 이의를 먼저 수락하거나 거부한 뒤 승강을 확정해 주세요.',
      });
    }

    const rule = this.ruleOf(series);

    // preview 이후 어드민이 승강 규칙을 바꿨다면 어드민이 화면에서 보고 승인한 계산과
    // 지금 서버가 하는 계산이 다르다. fromTier 는 규칙과 무관해 그대로라
    // PROMOTION_ENTRIES_TIER_MISMATCH 로는 절대 잡히지 않고, 대신 손대지도 않은 팀이
    // overriddenByAdmin=true 로 박제된다(alpha 실측: 수정 0건 · overriddenCount=2).
    // 지문이 어긋나면 다시 계산하게 돌려보낸다. tierCount 도 지문에 포함한다 — preview 이후
    // 다른 탭·다른 어드민이 티어 수를 바꿔도 rule 자체는 그대로라 지문 검사가 못 잡던
    // 결함(같은 alpha 실측 사고)을 tierCount 를 함께 해시해 잡는다.
    if (dto.ruleFingerprint !== undefined && dto.ruleFingerprint !== promotionRuleFingerprint(rule, series.tierCount)) {
      throw new ConflictException({
        code: 'PROMOTION_RULE_CHANGED',
        message: '승강 규칙이 바뀌었어요. 승강 후보를 다시 계산해 주세요.',
      });
    }

    const plan = calculatePromotions({
      tierCount: series.tierCount,
      rule,
      tiers: tiers.map((t) => t.input),
    });
    const computedByTeamId = new Map(
      plan.tiers.flatMap((tier) => tier.entries.map((entry) => [entry.teamId, entry] as const)),
    );

    // 시즌에 속한 모든 팀이 결정에 포함돼야 한다 — 빠진 팀이 있으면 다음 시즌에서 조용히 사라진다.
    const seasonTeamIds = new Set(computedByTeamId.keys());
    const submittedTeamIds = new Set(dto.entries.map((e) => e.teamId));
    const missing = [...seasonTeamIds].filter((id) => !submittedTeamIds.has(id));
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PROMOTION_ENTRIES_INCOMPLETE',
        message: `승강 결정이 빠진 팀이 ${missing.length}개 있어요.`,
        details: { missingTeamIds: missing },
      });
    }
    const unknown = [...submittedTeamIds].filter((id) => !seasonTeamIds.has(id));
    if (unknown.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PROMOTION_ENTRIES_UNKNOWN_TEAM',
        message: '이 시즌에 참가하지 않은 팀이 결정에 섞여 있어요.',
        details: { unknownTeamIds: unknown },
      });
    }

    // 같은 팀이 두 번 실려 오면 위의 Set 비교는 통과하지만 아래 createMany 가
    // (fromLeagueId, teamId) unique 제약에 걸려 Prisma 예외가 500 으로 새어 나간다.
    if (dto.entries.length !== submittedTeamIds.size) {
      const seen = new Set<string>();
      const duplicated = [...new Set(dto.entries.filter((e) => !seen.add(e.teamId)).map((e) => e.teamId))];
      throw new UnprocessableEntityException({
        code: 'PROMOTION_ENTRIES_DUPLICATED',
        message: '같은 팀에 대한 결정이 두 번 들어왔어요.',
        details: { duplicatedTeamIds: duplicated },
      });
    }

    // fromTier 를 받아만 두고 쓰지 않으면 클라이언트가 엉뚱한 티어를 보내도 조용히 통과한다.
    // 서버가 아는 티어와 다르면 클라이언트가 낡은 preview 를 들고 있다는 뜻이다.
    const tierMismatch = dto.entries.filter((entry) => entry.fromTier !== computedByTeamId.get(entry.teamId)!.tier);
    if (tierMismatch.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PROMOTION_ENTRIES_TIER_MISMATCH',
        message: '순위표가 바뀌었어요. 승강 후보를 다시 계산해 주세요.',
        details: {
          mismatches: tierMismatch.map((entry) => ({
            teamId: entry.teamId,
            sentTier: entry.fromTier,
            actualTier: computedByTeamId.get(entry.teamId)!.tier,
          })),
        },
      });
    }

    // 1부에서 승격, 최하위에서 강등은 갈 곳이 없다. 막지 않으면 kind 는 promoted 인데
    // 티어는 그대로인 모순 행이 저장된다.
    const impossible = dto.entries.filter((entry) => {
      const tier = computedByTeamId.get(entry.teamId)!.tier;
      return (
        (entry.kind === 'promoted' && tier <= 1) ||
        (entry.kind === 'relegated' && tier >= series.tierCount)
      );
    });
    if (impossible.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PROMOTION_KIND_IMPOSSIBLE',
        message: '가장 위 티어에서 승격하거나 가장 아래 티어에서 강등할 수는 없어요.',
        details: {
          entries: impossible.map((entry) => ({
            teamId: entry.teamId,
            tier: computedByTeamId.get(entry.teamId)!.tier,
            kind: entry.kind,
          })),
        },
      });
    }

    // ## 계산 결과를 뒤집으면 사유가 필수다 (D9)
    // 계산대로 두는 항목은 설명할 게 없다 — 규칙이 이미 설명이다. **운영자가 뒤집은 항목**은
    // 그 팀에게 시즌 티어가 달라지는 조치이고, 나중에 "왜 우리가 강등됐나" 를 답할 수 있어야
    // 한다(정본: "운영자가 **사유와 함께** 조정"). `overrideNote` 는 이미 저장되고 조회에도
    // 실리는데(`:605`) 비워 둘 수 있어서, 실제로는 대부분 비어 있었다.
    const missingNote = dto.entries.filter(
      (entry) =>
        entry.kind !== computedByTeamId.get(entry.teamId)!.computedKind &&
        !entry.overrideNote?.trim(),
    );
    if (missingNote.length > 0) {
      throw new BadRequestException({
        code: 'PROMOTION_OVERRIDE_NOTE_REQUIRED',
        message: '계산 결과와 다르게 정하려면 사유를 입력해 주세요.',
        details: {
          entries: missingNote.map((entry) => ({
            teamId: entry.teamId,
            computedKind: computedByTeamId.get(entry.teamId)!.computedKind,
            kind: entry.kind,
          })),
        },
      });
    }

    const resolved = dto.entries.map((entry) => {
      const computed = computedByTeamId.get(entry.teamId)!;
      const toTier = this.resolveToTier(computed.tier, entry.kind);
      return {
        teamId: entry.teamId,
        fromLeagueId: leagueByTier.get(computed.tier)!,
        fromTier: computed.tier,
        toTier,
        kind: entry.kind,
        computedKind: computed.computedKind,
        overriddenByAdmin: entry.kind !== computed.computedKind,
        overrideNote: entry.overrideNote ?? null,
      };
    });

    // 다음 시즌 티어별 팀 수를 미리 세어, 리그로 성립하지 않는 티어가 있으면 확정을 막는다.
    // 시딩(seedSeason)은 "티어당 2팀 이상"을 422 로 강제하는데 승강 경로에는 그 가드가
    // 없어서, 1팀짜리 리그가 만들어질 수 있었다(alpha 실측: teamCount:1 리그 생성).
    // 그 리그는 대진 생성이 영구히 422 LEAGUE_TEAM_INVALID 라 시작도 종료도 못 하는
    // 죽은 리그가 되고, 승강으로 만들어졌으니 어드민이 팀을 더 넣을 경로도 없다.
    // 판정은 planNextSeasonTiers 가 소유한다 — 아래 생성 루프와 같은 계산을 두 번 쓰면
    // 한쪽만 고쳐져 가드가 새는 날이 온다.
    const nextSeasonPlan = planNextSeasonTiers({ resolved, tierCount: series.tierCount });
    if (nextSeasonPlan.undersized.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PROMOTION_NEXT_SEASON_TIER_TOO_SMALL',
        message:
          `${nextSeasonPlan.undersized.map((t) => tierLabel(t.tier)).join(' · ')}가 다음 시즌에 1팀만 남아요. ` +
          '리그는 2팀 이상이어야 해요. 불참 처리한 팀이나 승강 결정을 조정해 주세요.',
        details: {
          tiers: nextSeasonPlan.undersized.map((entry) => ({ tier: entry.tier, teamCount: entry.teamIds.length })),
        },
      });
    }

    // 다음 시즌 로스터에 비활성(suspended)·삭제된 팀이 섞여 있으면 확정 자체를 막는다.
    // seedSeason(:240-249)/addTeam(league-match-admin.service.ts:381)이 강제하는 "활성 팀만"
    // 불변식을 이 경로에도 적용한다 — 자세한 이유는 findInactivePromotionTeamIds doc comment 참고.
    const nextSeasonTeamIds = nextSeasonPlan.tiers.flatMap((t) => t.teamIds);
    if (nextSeasonTeamIds.length > 0) {
      const activeTeams = await this.prisma.v1Team.findMany({
        where: { id: { in: nextSeasonTeamIds }, status: 'active', deletedAt: null },
        select: { id: true },
      });
      const inactiveTeamIds = findInactivePromotionTeamIds(nextSeasonTeamIds, new Set(activeTeams.map((t) => t.id)));
      if (inactiveTeamIds.length > 0) {
        throw new UnprocessableEntityException({
          code: 'PROMOTION_TEAM_INACTIVE',
          message:
            `${inactiveTeamIds.map((teamId) => teamNameById.get(teamId) ?? teamId).join(' · ')} 팀이 ` +
            '비활성화되었거나 삭제됐어요. 승강 확정 전에 팀 상태를 확인하거나 승강 결정을 조정해 주세요.',
          details: { inactiveTeamIds },
        });
      }
    }

    const nextSeasonNo = seasonNo + 1;
    const lastSeason = await this.prisma.v1League.findFirst({
      where: { seriesId, seasonNo },
      orderBy: { endsOn: 'desc' },
      select: { startsOn: true, endsOn: true },
    });
    const spanMs =
      lastSeason === null
        ? SEASON_LENGTH_FALLBACK_DAYS * 24 * 60 * 60 * 1000
        : Math.max(lastSeason.endsOn.getTime() - lastSeason.startsOn.getTime(), 24 * 60 * 60 * 1000);
    const nextStartsOn = lastSeason === null ? new Date() : new Date(lastSeason.endsOn.getTime() + 24 * 60 * 60 * 1000);
    const nextEndsOn = new Date(nextStartsOn.getTime() + spanMs);

    const result = await this.runCommitTransaction(tiers.map((t) => t.leagueId), async (tx) => {
      await tx.v1LeaguePromotion.createMany({
        data: resolved.map((row) => ({
          fromLeagueId: row.fromLeagueId,
          teamId: row.teamId,
          fromTier: row.fromTier,
          toTier: row.toTier,
          kind: row.kind,
          computedKind: row.computedKind,
          overriddenByAdmin: row.overriddenByAdmin,
          overrideNote: row.overrideNote,
          decidedByAdminUserId: admin.id,
        })),
      });

      const createdLeagues: Array<{ id: string; tier: number; teamCount: number }> = [];
      {
        // 1팀 티어는 위에서 이미 422 로 막혔으므로 여기 남는 것은 2팀 이상 뿐이다.
        for (const { tier, teamIds } of nextSeasonPlan.tiers) {
          const league = await tx.v1League.create({
            data: {
              title: `${series.title} ${nextSeasonNo}시즌 ${tierLabel(tier)}`,
              sportId: series.sportId,
              regionId: series.regionId,
              createdByAdminUserId: admin.id,
              startsOn: nextStartsOn,
              endsOn: nextEndsOn,
              tieBreakJson: { order: DEFAULT_TIE_BREAK_ORDER },
              seriesId,
              tier,
              seasonNo: nextSeasonNo,
              teams: { createMany: { data: teamIds.map((teamId) => ({ teamId })) } },
            },
            include: { sport: { select: { code: true } } },
          });
          // dual-write — 통합 축에 같은 리그를 비춘다(같은 트랜잭션). 없으면 이 리그는
          // read-swap 뒤 화면에서 에러 없이 사라진다.
          await createLeagueMirrorWithRosterSchedule(tx, leagueMirrorCreateData(toMirrorSource(league)), {
            leagueId: league.id,
            startsOn: nextStartsOn,
          });
          // 승계로 들어온 팀은 `promoted` 다 — 운영자가 손으로 넣은 `seeded` 와 다른
          // 사건이고, 다음 시즌 참가 통보·이의 처리에서 "왜 여기 있나" 의 답이 갈린다.
          for (const teamId of teamIds) {
            await createLeagueRosterRegistration(tx, {
              leagueId: league.id,
              teamId,
              entrySource: 'promoted',
            });
          }
          createdLeagues.push({ id: league.id, tier, teamCount: teamIds.length });
        }
      }

      // tx 를 반드시 넘긴다. 안 넘기면 logAdminAction 이 this.prisma 로 떨어져
      // **트랜잭션을 점유한 채 풀에서 두 번째 커넥션을 잡는다.** 동시 요청 N 건이면
      // 커넥션 2N 개가 필요해지고, 풀 크기보다 커지는 순간 전원이 서로를 기다리는
      // 자기 교착에 빠진다 — alpha 실측에서 동시 6건이 **한 건도 성공하지 못하고**
      // 전부 "트랜잭션을 시작할 수 없음"으로 죽은 이유가 이것이다(경합이라면 한 건은
      // 이겼어야 한다). 감사 로그가 확정과 같은 트랜잭션에 들어가는 것이 의미상으로도
      // 맞다 — 롤백된 확정이 감사 로그에는 남아 있으면 안 된다.
      await this.adminContext.logAdminAction(admin, {
        action: 'league_series.commit_promotions',
        targetType: 'league_series',
        targetId: seriesId,
      }, tx);

      return { createdLeagues };
    });

    // 리그 감사 그룹 A / R3: 승강 확정 알림 — 트랜잭션 커밋 후, 대상 팀 각각에 결과를 알린다.
    // 근거는 notifyPromotionDecisions의 doc comment 참고.
    this.notifyPromotionDecisions(resolved, result.createdLeagues);

    return {
      seriesId,
      seasonNo,
      nextSeasonNo,
      decidedCount: resolved.length,
      overriddenCount: resolved.filter((row) => row.overriddenByAdmin).length,
      nextSeasonLeagues: result.createdLeagues.map((league) => ({ ...league, tierLabel: tierLabel(league.tier) })),
    };
  }

  /**
   * 리그 감사 그룹 A / R3: 승강 확정(commitPromotions) 결과를 팀별로 알린다.
   *
   * **새 V1NotificationTargetType을 추가하지 않았다** — 마이그레이션이 필요한 DB enum이고,
   * 승격/강등/잔류/불참은 결국 "이 팀의 소속이 바뀌었다"는 팀 단위 사실이라 기존 'team'
   * 타입(team_join_application_*, team_invitation_* 이 이미 쓰는 것과 같은 부류)으로
   * 충분하다고 판단했다. 실제 클릭 목적지(다음 시즌 리그 상세, 또는 불참 팀은 방금 끝난
   * 시즌의 리그 상세)는 notifications.service.ts의 deepLinkForEvent가 targetType과 무관하게
   * 명시적으로 처리한다(team_contact_* 항목의 기존 선례와 동일한 패턴).
   *
   * 승격/강등/잔류는 다음 시즌 새 리그(`createdLeagues`, 티어별로 정확히 하나)로 보내고,
   * 불참(withdrawn)은 다음 시즌 리그 자체가 없으므로 이번 시즌 리그(`fromLeagueId`, 이제
   * completed 상태)로 보낸다 — 최종 순위표는 여전히 거기서 볼 수 있다.
   */
  private notifyPromotionDecisions(
    resolved: Array<{ teamId: string; fromLeagueId: string; toTier: number; kind: PromotionKind }>,
    createdLeagues: Array<{ id: string; tier: number }>,
  ): void {
    const newLeagueIdByTier = new Map(createdLeagues.map((league) => [league.tier, league.id]));
    for (const entry of resolved) {
      const targetLeagueId = entry.kind === 'withdrawn' ? entry.fromLeagueId : newLeagueIdByTier.get(entry.toTier);
      // undersized 티어는 commitPromotions가 이미 422로 막았으므로 withdrawn 외에는 항상
      // 존재해야 한다 — 그래도 방어적으로 못 찾으면 알림 없이 건너뛴다(진짜 확정 자체를
      // 막을 이유는 아니다).
      if (targetLeagueId === undefined) continue;

      const eventType =
        entry.kind === 'promoted'
          ? ('league_promotion_promoted' as const)
          : entry.kind === 'relegated'
            ? ('league_promotion_relegated' as const)
            : entry.kind === 'withdrawn'
              ? ('league_promotion_withdrawn' as const)
              : ('league_promotion_stayed' as const);
      const body =
        entry.kind === 'promoted'
          ? `"${tierLabel(entry.toTier)}"로 승격했어요! 다음 시즌도 화이팅이에요.`
          : entry.kind === 'relegated'
            ? `"${tierLabel(entry.toTier)}"로 강등됐어요. 다음 시즌에 다시 도전해요.`
            : entry.kind === 'withdrawn'
              ? '이번 시즌을 끝으로 리그 참가가 종료됐어요.'
              : `계속 "${tierLabel(entry.toTier)}"에서 다음 시즌을 이어가요.`;

      const teamId = entry.teamId;
      this.notifications.emitToManyDeferred(
        async () =>
          (
            await this.prisma.v1TeamMembership.findMany({
              where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        eventType,
        targetLeagueId,
        body,
      );
    }
  }

  /**
   * commit 트랜잭션 실행 + 중복 확정 경합 처리.
   *
   * PROMOTION_ALREADY_DECIDED 는 findFirst 로 먼저 확인하지만, 그 확인과 createMany
   * 사이에는 틈이 있다. 두 어드민이 동시에 최종 승인을 누르면 둘 다 확인을 통과한 뒤
   * 하나가 (fromLeagueId, teamId) unique 제약에 걸린다. 그 P2002 는 HttpException 이
   * 아니라 전역 필터가 그대로 500 INTERNAL_ERROR 로 내보냈다 — alpha 실측: 동시 6발 중
   * 1건 201 · **5건 500**. 데이터 자체는 unique 제약 + 트랜잭션 롤백이 지켜 냈지만
   * (중복 리그 0건 확인), 어드민에게는 "서버 오류"로 보여 재시도를 유발한다.
   * 진 쪽에도 선착 확인과 같은 409 를 돌려준다.
   */
  private async runCommitTransaction<T>(
    fromLeagueIds: readonly string[],
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        // 확정 한 번이 승강 이력 + 다음 시즌 리그(최대 3개) + 참가팀 + 감사 로그를 한 묶음으로
        // 처리한다. Prisma 기본값(maxWait 2초 · timeout 5초)으로는 동시 요청이 겹치는 순간
        // 커넥션을 못 잡고 줄줄이 실패했다 — alpha 실측: 동시 6~8건에서 대부분 503.
        // 다만 **앞단 ALB idle_timeout(60초)** 을 넘겨선 안 된다. 120초로 두면 운영자가
        // 60초에 504 를 받아 "실패했다"고 믿는 동안 승강이 **그대로 확정**되고, 다시
        // 누르면 PROMOTION_ALREADY_DECIDED 로 막혀 무슨 일이 일어난 건지 알 수 없다.
        // 45초 + maxWait 5초 = 최악 50초로 맞춘다(대진 생성·대회 레인과 같은 기준:
        // tournaments/league-fixture-generator.service.ts, docs/ops/alb-idle-timeout.md).
        // 줄을 서서 성공한다는 원래 의도는 maxWait 5초로도 유지된다 — 실패 원인이던
        // Prisma 기본값(2초)보다 여전히 넉넉하다.
        maxWait: 5_000,
        timeout: 45_000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'PROMOTION_ALREADY_DECIDED',
          message: '이미 승강이 확정된 시즌이에요.',
        });
      }

      // 가용성 실패(커넥션 풀 포화·트랜잭션 시작/시간 초과)는 "아무 일도 없었다"를 뜻하지
      // **않는다**. Prisma 인터랙티브 트랜잭션은 커밋이 끝난 뒤에도 래퍼 타임아웃을 던질 수
      // 있어서, 저장은 됐는데 호출자에게는 503 이 나가는 구간이 있다 — alpha 실측(동시 8건):
      // 201 을 받은 요청이 하나도 없는데 다음 시즌은 정확히 한 벌 생성됐다.
      // 그대로 두면 어드민이 "실패했구나" 하고 읽는데 실제로는 확정이 끝나 있다.
      // 그래서 503 으로 넘기기 전에 이력이 실제로 남았는지 한 번 확인하고, 남았으면
      // 선착 확인과 같은 409 로 사실대로 답한다.
      if (isPrismaAvailabilityError(error)) {
        const landed = await this.prisma.v1LeaguePromotion
          .findFirst({ where: { fromLeagueId: { in: [...fromLeagueIds] } }, select: { id: true } })
          .catch(() => null); // 확인 자체가 또 실패하면 원래 에러를 그대로 올린다.
        if (landed !== null) {
          throw new ConflictException({
            code: 'PROMOTION_ALREADY_DECIDED',
            message: '이미 승강이 확정된 시즌이에요.',
          });
        }
      }

      throw error;
    }
  }

  /**
   * 경계를 넘는 조합(1부 승격 / 최하위 강등)은 commitPromotions 가 이미 422 로 막는다.
   * 그래서 여기서 clamp 하지 않는다 — clamp 하면 "승격인데 티어는 그대로"인 모순 행을
   * 조용히 만들어 버린다.
   */
  private resolveToTier(fromTier: number, kind: PromotionKind): number {
    if (kind === 'promoted') return fromTier - 1;
    if (kind === 'relegated') return fromTier + 1;
    return fromTier;
  }

  private ruleOf(series: { promotionRuleJson: unknown }): PromotionRule {
    return resolvePromotionRule(series.promotionRuleJson);
  }

  private async loadSeries(seriesId: string) {
    const series = await this.prisma.v1LeagueSeries.findUnique({ where: { id: seriesId } });
    if (series === null) {
      throw new NotFoundException({ code: 'LEAGUE_SERIES_NOT_FOUND', message: '리그 체계를 찾을 수 없어요.' });
    }
    return series;
  }

  /**
   * 시즌의 티어별 확정 순위표. 시즌이 실제로 끝나지 않았으면 승강을 계산하지 않는다.
   *
   * 게이트가 `pendingFixtures > 0`이면 안 된다(2026-08-21 재감사에서 실측으로 잡힌 결함).
   * `pendingFixtures`는 **존재하는** 대진 중 미확정인 것만 세므로, 대진이 아직 하나도
   * 없는 리그(`state=draft`)나 전 대진이 취소된 리그는 pending이 0이라 게이트를 그냥
   * 통과한다. 그러면 전 팀 0승0무0패·0점인 순위표가 넘어가고, tie-break가 전부 소진된
   * 뒤 `calculateLeagueStandings`의 결정적 폴백(팀ID 사전순)이 순위를 정한다 --
   * 즉 **한 경기도 치르지 않은 시즌의 강등 팀이 UUID 사전순으로 뽑힌다.**
   * alpha에서 3티어 전부 draft·대진 0건인 시리즈로 재현해 201 + 완전한 승강안을 받았다.
   *
   * 그래서 판정 기준을 D-3이 이미 만들어 둔 리그 상태(`completed`)로 옮긴다. 이 상태는
   * "취소 제외 전 대진이 공식 결과를 확보했다"를 뜻하므로 승강이 요구하는 "확정 순위표"와
   * 정확히 같은 조건이고, draft·빈 리그를 자동으로 배제한다.
   * (대진을 취소로 끝낸 리그도 `completed`가 되도록 `cancelFixture`에 완료 재평가를
   * 함께 넣었다 -- 그게 없으면 이 게이트가 교착을 만든다.)
   */

  private async loadSeasonStandings(seriesId: string, seasonNo: number) {
    const leagues = await this.prisma.v1League.findMany({
      where: { seriesId, seasonNo },
      orderBy: { tier: 'asc' },
      select: { id: true, tier: true, state: true },
    });
    if (leagues.length === 0) {
      throw new NotFoundException({
        code: 'LEAGUE_SEASON_NOT_FOUND',
        message: '해당 시즌의 리그를 찾을 수 없어요.',
      });
    }

    // V1League.state 는 이 조건의 정확한 투영이다: draft -> active 는 대진 생성 시,
    // active -> completed 는 LeagueCompletionProjectionService 가 "취소 아닌 대진이
    // 1건 이상 있고 전부 공식 확정" 일 때만 전이시킨다. 그래서 completed 를 요구하면
    // "대진 0건"과 "미확정 잔존"이 한 번에 막힌다.
    const unfinished = findUnfinishedSeasonLeagues(leagues);
    if (unfinished.length > 0) {
      const labels = unfinished.map((league) => tierLabel(league.tier ?? 1)).join(' · ');
      throw new ConflictException({
        code: 'LEAGUE_SEASON_NOT_FINISHED',
        message: `${labels}가 아직 끝나지 않았어요. 모든 경기 결과가 확정돼야 승강을 계산할 수 있어요.`,
        details: {
          unfinished: unfinished.map((league) => ({
            leagueId: league.id,
            tier: league.tier ?? 1,
            state: league.state,
          })),
        },
      });
    }

    const tiers: Array<{ leagueId: string; input: TierStandingsInput; tieBreakGroups: StandingsTieGroup[] }> = [];
    const leagueByTier = new Map<number, string>();
    const teamNameById = new Map<string, string>();

    // 티어별 순위표는 서로 독립이라 직렬로 기다릴 이유가 없다 — 티어마다 리그 전체
    // 경기·공식결과를 훑는 무거운 조회다(3티어면 왕복 3번).
    const results = await Promise.all(leagues.map((league) => this.publicService.standings(league.id)));

    for (const [index, league] of leagues.entries()) {
      const tier = league.tier ?? 1;
      const result = results[index];
      // state=completed 면 여기 걸릴 일이 없지만, 프로젝션이 놓친 경로가 생겨도
      // 미확정 경기가 순위에 섞이지 않도록 방어선을 남긴다.
      if (result.pendingFixtures.length > 0) {
        throw new ConflictException({
          code: 'LEAGUE_SEASON_NOT_FINISHED',
          message: `${tierLabel(tier)}에 아직 결과가 확정되지 않은 경기가 ${result.pendingFixtures.length}개 있어요.`,
          details: { tier, pendingCount: result.pendingFixtures.length },
        });
      }
      for (const row of result.standings) teamNameById.set(row.teamId, row.teamName);
      leagueByTier.set(tier, league.id);
      // tieBreakGroups 는 standings() 가 이미 계산해 둔 값을 그대로 옮긴다 --
      // 여기서 다시 계산하면 fixtures를 또 훑어야 하는 별도 조회가 생긴다(감사 H-5).
      tiers.push({ leagueId: league.id, input: { tier, standings: result.standings }, tieBreakGroups: result.tieBreakGroups });
    }

    return { tiers, leagueByTier, teamNameById };
  }

  private serializeSeries(series: {
    id: string;
    title: string;
    sportId: string;
    regionId: string;
    tierCount: number;
    promotionRuleJson: unknown;
    state: string;
    createdAt: Date;
  }) {
    return {
      id: series.id,
      title: series.title,
      sportId: series.sportId,
      regionId: series.regionId,
      tierCount: series.tierCount,
      tierLabels: Array.from({ length: series.tierCount }, (_, i) => tierLabel(i + 1)),
      promotionRule: this.ruleOf(series),
      state: series.state,
      createdAt: series.createdAt,
    };
  }

  private groupBySeason(
    leagues: Array<{
      id: string;
      title: string;
      tier: number | null;
      seasonNo: number | null;
      state: string;
      startsOn: Date;
      endsOn: Date;
      _count: { teams: number };
    }>,
  ) {
    const bySeason = new Map<number, typeof leagues>();
    for (const league of leagues) {
      const seasonNo = league.seasonNo ?? 1;
      const bucket = bySeason.get(seasonNo) ?? [];
      bucket.push(league);
      bySeason.set(seasonNo, bucket);
    }
    return [...bySeason.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([seasonNo, rows]) => ({
        seasonNo,
        allCompleted: rows.every((row) => row.state === 'completed'),
        tiers: rows.map((row) => ({
          leagueId: row.id,
          title: row.title,
          tier: row.tier,
          tierLabel: row.tier === null ? null : tierLabel(row.tier),
          state: row.state,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          teamCount: row._count.teams,
        })),
      }));
  }
}
