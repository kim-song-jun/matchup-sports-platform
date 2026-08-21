import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { LeagueMatchPublicService } from './league-match-public.service';
import { findUnfinishedSeasonLeagues, planNextSeasonTiers } from './league-lifecycle-rules';
import {
  calculatePromotions,
  validatePromotionRule,
  DEFAULT_PROMOTION_RULE,
  type PromotionKind,
  type PromotionRule,
  type TierStandingsInput,
} from './league-promotion';
import {
  CommitPromotionsDto,
  CreateLeagueSeriesDto,
  SeedSeasonDto,
  UpdateLeagueSeriesDto,
} from './dto/league-series.dto';

const DEFAULT_TIE_BREAK_ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;
const SEASON_LENGTH_FALLBACK_DAYS = 90;

/** 화면 문구는 A/B/C 가 아니라 국내 생활체육 관행대로 "N부"다. */
export function tierLabel(tier: number): string {
  return `${tier}부`;
}

@Injectable()
export class LeagueSeriesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly publicService: LeagueMatchPublicService,
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
      });
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
      });
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

    const startsOn = new Date();
    const endsOn = new Date(startsOn.getTime() + SEASON_LENGTH_FALLBACK_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.prisma.$transaction(async (tx) => {
      const leagues = [];
      for (const tier of tiers) {
        leagues.push(
          await tx.v1League.create({
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
            select: { id: true, title: true, tier: true, seasonNo: true, state: true },
          }),
        );
      }
      await tx.v1LeagueSeries.update({ where: { id: seriesId }, data: { state: 'active' } });
      await this.adminContext.logAdminAction(admin, {
        action: 'league_series.seed_season',
        targetType: 'league_series',
        targetId: seriesId,
      });
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
    const { tiers, leagueByTier } = await this.loadSeasonStandings(seriesId, seasonNo);

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

    const plan = calculatePromotions({
      tierCount: series.tierCount,
      rule: this.ruleOf(series),
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

    const result = await this.prisma.$transaction(async (tx) => {
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
      // 팀 2개 미만인 티어는 만들지 않는다 -- 규칙과 근거는 planNextSeasonTiers 참고.
      const plan = planNextSeasonTiers({ resolved, tierCount: series.tierCount });
      const skippedTiers = plan.skipped.map((entry) => ({
        tier: entry.tier,
        tierLabel: tierLabel(entry.tier),
        teamCount: entry.teamIds.length,
      }));
      if (dto.createNextSeason !== false) {
        for (const { tier, teamIds } of plan.tiers) {
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
            select: { id: true },
          });
          createdLeagues.push({ id: league.id, tier, teamCount: teamIds.length });
        }
      }

      await this.adminContext.logAdminAction(admin, {
        action: 'league_series.commit_promotions',
        targetType: 'league_series',
        targetId: seriesId,
      });

      return { createdLeagues, skippedTiers };
    });

    return {
      seriesId,
      seasonNo,
      nextSeasonNo,
      decidedCount: resolved.length,
      overriddenCount: resolved.filter((row) => row.overriddenByAdmin).length,
      nextSeasonLeagues: result.createdLeagues.map((league) => ({ ...league, tierLabel: tierLabel(league.tier) })),
      // 팀이 2개 미만이라 다음 시즌에 만들지 않은 티어. 조용히 빠지면 운영자가
      // "왜 3부가 없지?"를 알 방법이 없다.
      skippedTiers: result.skippedTiers,
    };
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
    const raw = series.promotionRuleJson;
    if (raw === null || typeof raw !== 'object') return { ...DEFAULT_PROMOTION_RULE };
    return raw as PromotionRule;
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

    const tiers: Array<{ leagueId: string; input: TierStandingsInput }> = [];
    const leagueByTier = new Map<number, string>();
    const teamNameById = new Map<string, string>();

    for (const league of leagues) {
      const tier = league.tier ?? 1;
      const result = await this.publicService.standings(league.id);
      for (const row of result.standings) teamNameById.set(row.teamId, row.teamName);
      leagueByTier.set(tier, league.id);
      tiers.push({ leagueId: league.id, input: { tier, standings: result.standings } });
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
