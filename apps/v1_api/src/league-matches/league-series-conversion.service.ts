import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';
import { leagueMirrorCreateData } from '../tournaments/league-competition-mirror';
import { createLeagueMirrorWithRosterSchedule } from '../jobs/league-roster/league-roster-autoconfirm.service';
import { createLeagueRosterRegistration } from './league-team-admission';
import { calculateLeagueStandingsWithTieBreakInfo } from './league-standings';
import { LEAGUE_TIE_BREAK_ORDER } from './league-tie-break';
import { bucketLeagueFixtures } from './league-standings-source';
import { DEFAULT_PROMOTION_RULE } from './league-promotion';
import { planLeagueConversion, validateLeagueConversionEntries } from './league-series-conversion-plan';
import { CommitLeagueConversionDto, PreviewLeagueConversionDto } from './dto/league-series-conversion.dto';
import { findNextSeasonLeague, LEAGUE_CONVERSION_ACTION } from './league-season-link';

const ACTION = LEAGUE_CONVERSION_ACTION;
@Injectable()
export class LeagueSeriesConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admins: AdminContextService,
  ) {}

  async status(user: V1AuthUser, leagueId: string) {
    await this.admins.getActiveAdmin(user.id);
    const source = await findTournamentOnSurface(this.prisma, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      select: { seriesId: true },
    });
    if (!source) throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    const log = await this.prisma.v1AdminActionLog.findFirst({
      where: { action: ACTION, targetType: 'league', targetId: leagueId },
    });
    const value = log?.afterJson;
    const seriesId =
      value && typeof value === 'object' && !Array.isArray(value) && typeof value.seriesId === 'string'
        ? value.seriesId
        : null;
    return { seriesId: source.seriesId ?? seriesId };
  }

  private async load(tx: Prisma.TransactionClient, leagueId: string, dto: PreviewLeagueConversionDto) {
    // 첫 문장으로 원본 행을 잠근다 — 다음 시즌 잇기(`assertNextSeasonSourceInTx`)가 같은 행을 갱신하므로 둘이 겹치면
    // 한쪽이 기다리거나 직렬화 충돌(409)로 끝난다. 둘 중 하나만 한다(2026-11-03 사용자 선택).
    await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${leagueId} AND kind = 'regular_league' FOR UPDATE`;
    const source = await findTournamentOnSurface(tx, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      include: { sport: true, registrations: { where: { status: 'confirmed' }, include: { team: true } } },
    });
    if (!source) throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    if (!source.regionId)
      throw new ConflictException({ code: 'LEAGUE_REGION_INVALID', message: '원본 리그의 지역을 먼저 확인해 주세요.' });
    const previous = await tx.v1AdminActionLog.findFirst({
      where: { action: ACTION, targetType: 'league', targetId: leagueId },
    });
    if (source.seriesId || previous)
      throw new ConflictException({ code: 'LEAGUE_ALREADY_CONVERTED', message: '이미 리그 체계에 연결된 리그예요.' });
    if (await findNextSeasonLeague(tx, leagueId))
      throw new ConflictException({
        code: 'LEAGUE_NEXT_SEASON_EXISTS',
        message: '다음 시즌을 이은 리그는 리그 체계로 전환할 수 없어요.',
      });
    if (source.status !== 'completed')
      throw new ConflictException({ code: 'LEAGUE_NOT_COMPLETED', message: '리그를 종료한 뒤 전환해 주세요.' });
    const teams = source.registrations.map((r) => r.team);
    if (teams.some((t) => t.status !== 'active' || t.deletedAt !== null || t.sportId !== source.sportId)) {
      throw new ConflictException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '참가팀의 활성 상태와 종목을 확인해 주세요.',
      });
    }
    // 빈 자리도 검증한다. 공개 일정의 빈 경기 필터로 미확정 대진을 숨기면 안 된다.
    const matches = await tx.v1TeamMatch.findMany({
      where: { leagueId, deletedAt: null },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
        status: true,
        game: {
          select: { id: true, currentOfficialRevisionId: true, currentOfficialRevision: { select: { state: true } } },
        },
      },
    });
    const ids = matches.flatMap((m) =>
      m.game?.currentOfficialRevision?.state === 'OFFICIAL' && m.game.currentOfficialRevisionId
        ? [m.game.currentOfficialRevisionId]
        : [],
    );
    const facts = await tx.v1GameOfficialFact.findMany({
      where: { revisionId: { in: ids } },
      select: { gameId: true, homeScore: true, awayScore: true },
    });
    if (matches.some((m) => m.status !== 'cancelled' && !m.hostTeamId))
      throw new ConflictException({
        code: 'LEAGUE_RESULTS_PENDING',
        message: '팀이 비어 있는 경기를 먼저 정리해 주세요.',
      });
    if (matches.some((m) => m.status !== 'cancelled' && !m.startAt))
      throw new ConflictException({ code: 'LEAGUE_SCHEDULE_INVALID', message: '경기 시작 시각을 먼저 확인해 주세요.' });
    const valid = matches.filter(
      (m): m is typeof m & { hostTeamId: string; startAt: Date } => m.hostTeamId !== null && m.startAt !== null,
    );
    const buckets = bucketLeagueFixtures(valid, new Map(facts.map((f) => [f.gameId, f])));
    if (buckets.pending.length || !buckets.confirmed.length)
      throw new ConflictException({
        code: 'LEAGUE_RESULTS_PENDING',
        message: '유효한 경기 결과를 모두 공식 확정해 주세요.',
      });
    const ranked = calculateLeagueStandingsWithTieBreakInfo({
      teamIds: teams.map((t) => t.id),
      fixtures: buckets.confirmed,
      tieBreakOrder: LEAGUE_TIE_BREAK_ORDER,
    });
    const plan = planLeagueConversion(
      ranked.standings.map((row) => ({ ...row, teamName: teams.find((t) => t.id === row.teamId)!.name })),
      dto.tierSizes,
      ranked.tieGroups,
    );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          source: source.updatedAt,
          teams: teams.map((t) => [t.id, t.updatedAt]).sort(),
          matches,
          facts: [...facts].sort((a, b) => a.gameId.localeCompare(b.gameId)),
          sizes: dto.tierSizes,
        }),
      )
      .digest('hex');
    return { source, plan, fingerprint };
  }

  async preview(user: V1AuthUser, leagueId: string, dto: PreviewLeagueConversionDto) {
    await this.admins.getMutationAdmin(user.id);
    return this.prisma.$transaction(
      async (tx) => {
        const { plan, fingerprint } = await this.load(tx, leagueId, dto);
        return { ...plan, fingerprint };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 },
    );
  }

  async commit(user: V1AuthUser, leagueId: string, dto: CommitLeagueConversionDto) {
    const admin = await this.admins.getMutationAdmin(user.id);
    if (!Array.isArray(dto.tierSizes)) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_CONVERSION_SIZES_INVALID',
        message: '각 티어에 2팀 이상, 모든 참가팀을 한 번씩 배정해 주세요.',
      });
    }
    const tierCount = dto.tierSizes.length;
    if (!Number.isInteger(tierCount) || tierCount < 1 || tierCount > 3) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_CONVERSION_SIZES_INVALID',
        message: '각 티어에 2팀 이상, 모든 참가팀을 한 번씩 배정해 주세요.',
      });
    }
    const startsOn = new Date(dto.startsOn),
      endsOn = new Date(dto.endsOn);
    if (
      !dto.title.trim() ||
      !Number.isFinite(startsOn.getTime()) ||
      !Number.isFinite(endsOn.getTime()) ||
      endsOn < startsOn
    )
      throw new BadRequestException({
        code: 'LEAGUE_PERIOD_INVALID',
        message: '리그 체계 이름과 올바른 시즌 기간을 입력해 주세요.',
      });
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 기존 경기·결과는 쓰지 않는다. 동일 원본의 동시 확정은 직렬화 충돌로 한 건만 허용한다.
          const { source, plan, fingerprint } = await this.load(tx, leagueId, dto);
          if (dto.fingerprint !== fingerprint)
            throw new ConflictException({
              code: 'LEAGUE_CONVERSION_STALE',
              message: '순위나 리그 정보가 바뀌었어요. 미리보기를 다시 확인해 주세요.',
            });
          validateLeagueConversionEntries(plan, dto.entries, dto.tierSizes);
          const series = await tx.v1LeagueSeries.create({
            data: {
              title: dto.title.trim(),
              sportId: source.sportId,
              regionId: source.regionId!,
              tierCount,
              promotionRuleJson: DEFAULT_PROMOTION_RULE as object,
              state: 'active',
              createdByAdminUserId: admin.id,
            },
          });
          const leagues = [];
          for (let tier = 1; tier <= 3; tier++) {
            if (tier > tierCount) break;
            const id = randomUUID();
            const title = `${dto.title.trim()} 1시즌 ${tier}부`;
            const data = leagueMirrorCreateData({
              id,
              title,
              sportId: source.sportId,
              regionId: source.regionId!,
              state: 'draft',
              startsOn,
              endsOn,
              seriesId: series.id,
              seasonNo: 1,
              tier,
              sportCode: source.sport.code,
              createdAt: new Date(),
              inherited: source,
            });
            await createLeagueMirrorWithRosterSchedule(
              tx,
              {
                ...data,
                competitionConfigVersionId: source.competitionConfigVersionId,
                venue: source.venue,
                venueAddress: source.venueAddress,
                latitude: source.latitude,
                longitude: source.longitude,
                venueProvider: source.venueProvider,
                venueProviderId: source.venueProviderId,
                genderCategory: source.genderCategory,
                genderMinMale: source.genderMinMale,
                genderMaxMale: source.genderMaxMale,
                genderMinFemale: source.genderMinFemale,
                genderMaxFemale: source.genderMaxFemale,
                rulesText: source.rulesText,
                isPublic: source.isPublic,
              },
              { leagueId: id, startsOn },
            );
            for (const entry of dto.entries.filter((e) => e.tier === tier))
              await createLeagueRosterRegistration(tx, { leagueId: id, teamId: entry.teamId, entrySource: 'seeded' });
            leagues.push({ id, title, tier });
          }
          // 감사 로그를 전환 연결과 확정 스냅샷의 영속 기록으로 사용한다. 원본은 독립 배치 리그로 남긴다.
          await this.admins.logAdminAction(
            admin,
            {
              action: ACTION,
              targetType: 'league',
              targetId: leagueId,
              beforeJson: { fingerprint, entries: plan.entries },
              afterJson: {
                seriesId: series.id,
                leagues,
                entries: dto.entries.map((e) => ({ teamId: e.teamId, tier: e.tier, reason: e.reason ?? null })),
              },
            },
            tx,
          );
          return { seriesId: series.id, leagues };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 45_000 },
      );
    } catch (error) {
      // 등록 헬퍼의 raw SQL에서 생긴 직렬화/교착 충돌은 P2034 대신 P2010으로 감싸진다.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))
      )
        throw new ConflictException({
          code: 'LEAGUE_CONVERSION_CONFLICT',
          message: '다른 변경과 겹쳤어요. 미리보기를 다시 확인해 주세요.',
        });
      throw error;
    }
  }
}
