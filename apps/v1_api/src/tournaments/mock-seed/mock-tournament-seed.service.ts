import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContextService } from '../../common/admin-context.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { runFixtureGameBackfill } from '../../games/migration/fixture-game-backfill';
import { isMockSeedEnabled } from './mock-seed.config';
import { CreateMockTournamentDto, type MockSeedStatus } from './mock-tournament-seed.dto';

/**
 * 시드 계정 전용 도메인. 목업 대회에는 이 도메인만으로 이뤄진 팀만 넣는다 —
 * 실사용자 팀을 끌어들이면 그 사람들 마이페이지에 가짜 대회가 뜨고 후기 대상까지 된다.
 * 실제 가입자는 이 도메인의 이메일을 가질 수 없다.
 */
const TEST_ACCOUNT_DOMAIN = '@teameet.test';

/** 라인업 제출에 필요한 최소 선발 인원. config.lineup 은 Json 이라 안전하게 읽는다. */
export function readLineupMinPlayers(lineup: unknown): number {
  const value = (lineup as { minPlayers?: unknown } | null)?.minPlayers;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 3;
}

type SeedAccount = { userId: string; email: string; nickname: string; role: string };
type SeedTeam = { teamId: string; name: string; ownerUserId: string; memberUserIds: string[]; accounts: SeedAccount[] };

/**
 * 검증용 목업 대회를 한 번에 만든다 — 대회 생성 → 팀 등록(확정) → 명단 채우기 → 조 편성 →
 * 대진 생성 → (옵션) 경기 결과까지.
 *
 * 왜 서비스가 Prisma 를 직접 쓰나: 이 체인을 HTTP 로 밟으려면 팀 신청(팀 매니저 세션) →
 * 어드민 승인 → 명단 등록(팀 세션) 처럼 **여러 사용자의 세션**이 필요하다. 시드는 한 명의
 * 어드민이 누르는 버튼이므로 각 단계를 서버에서 직접 구성한다.
 *
 * 라인업은 일부러 만들지 않는다 — 라인업 제출을 손으로 테스트하는 게 이 대회의 목적이다.
 */
@Injectable()
export class MockTournamentSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async createTournament(user: V1AuthUser, dto: CreateMockTournamentDto) {
    // 환경 잠금 — alpha compose 오버레이에만 켠다. NODE_ENV 로는 alpha 와 프로덕션을 구분할 수
    // 없어서(둘 다 production) 전용 플래그를 쓴다.
    if (!isMockSeedEnabled()) {
      throw new NotFoundException({ code: 'MOCK_SEED_DISABLED', message: '이 환경에서는 사용할 수 없어요.' });
    }
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const format = dto.format ?? 'group_knockout';
    const teamCount = dto.teamCount ?? (format === 'league' ? 4 : 4);
    const status: MockSeedStatus = dto.status ?? 'in_progress';
    // 후기를 쓰려면 공식 결과가 있어야 한다 — reviewReady 는 종료+결과를 함께 요구한다.
    const reviewReady = dto.reviewReady ?? false;
    const withLineups = dto.withLineups ?? false;
    const withResults = dto.withResults || reviewReady || status === 'completed';

    const sport = await this.pickSport();
    if (!sport) throw new BadRequestException({ code: 'NO_SPORT', message: '종목 데이터가 없어요.' });

    // 픽스처에 competitionConfigVersionId 가 없으면 fixture-game-backfill 이 CONFIG_MISSING 으로
    // 격리해 V1Game 이 만들어지지 않는다 — 운영 콘솔이 "경기 미생성"으로 뜨는 원인이다.
    // 값을 아는 쪽(이 시드)이 만들 때 바로 박는다.
    // 종목마다 config 가 따로 있고 라인업 하한도 다르다(alpha 실측: 풋살 3명 · 축구 7명).
    // 종목을 안 맞추고 최신 ACTIVE 를 집으면 대회 종목과 어긋난 규칙이 박힌다.
    const competitionConfig = await this.prisma.v1CompetitionConfigVersion.findFirst({
      where: { status: 'ACTIVE', sportCode: sport.code },
      orderBy: { createdAt: 'desc' },
      select: { id: true, lineup: true },
    });
    if (!competitionConfig) {
      throw new BadRequestException({
        code: 'NO_COMPETITION_CONFIG',
        message: `${sport.code} 종목의 ACTIVE 대회 설정(config)이 없어요. competition-config 백필을 먼저 돌려주세요.`,
      });
    }

    // 라인업 제출 최소 인원 — 이 인원을 못 채우는 팀을 넣으면 "포지션 자리가 비어 있어요"로
    // 제출 자체가 막혀 라인업 테스트가 불가능하다(alpha 실측: 멤버 4명 팀이 뽑혀 제출 불가).
    const minPlayers = readLineupMinPlayers(competitionConfig.lineup);

    const teams = await this.pickTeams(teamCount, minPlayers);
    const now = new Date();
    const label = dto.titleSuffix?.trim() || this.autoLabel(format, teamCount, status, reviewReady);
    const title = `(목업) ${this.stamp(now)} ${label}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.v1Tournament.create({
        data: {
          sportId: sport.id,
          title,
          format,
          teamCount,
          // 대회 참가 명단 하한도 라인업 하한과 맞춘다 — 어긋나면 명단은 통과했는데
          // 라인업 제출이 막히는 상태가 만들어진다.
          minPlayers,
          maxPlayers: Math.max(minPlayers + 5, 12),
          venue: '목업 테스트 경기장',
          scheduledAt: now,
          scheduledEndAt: now,
          registrationDeadlineAt: now,
          entryFee: 0,
          status: status === 'open' ? 'open' : status === 'in_progress' ? 'in_progress' : 'completed',
          competitionConfigVersionId: competitionConfig.id,
          createdByAdminUserId: admin.id,
        },
      });

      const registrations = [];
      for (const [index, team] of teams.entries()) {
        const registration = await tx.v1TournamentRegistration.create({
          data: {
            tournamentId: tournament.id,
            teamId: team.teamId,
            appliedByUserId: team.ownerUserId,
            status: 'confirmed',
            agreedRules: true,
            agreedPrivacy: true,
            agreedRefund: true,
            agreedMediaConsent: true,
          },
        });
        // 명단은 항상 채운다. 실제 userId 를 넣어야 후기 대상(상대 선수)이 생긴다.
        await tx.v1TournamentPlayer.createMany({
          data: team.memberUserIds.slice(0, Math.max(minPlayers + 2, 8)).map((userId, playerIndex) => ({
            registrationId: registration.id,
            userId,
            realName: `${team.name} 선수${playerIndex + 1}`,
            // 실 시드(seed-alpha-tournament-qa.ts)와 같은 값. default 인 needs_review 로 두면
            // 명단이 '검토 대기'로 남아서 "명단까지 채워진 대회"가 되지 않는다.
            eligibilityStatus: 'non_pro' as const,
          })),
          skipDuplicates: true,
        });
        registrations.push({ ...registration, sortOrder: index, teamName: team.name });
      }

      const fixtures = await this.buildFixtures(tx, tournament.id, format, registrations, withResults, now, competitionConfig.id);
      return { tournament, registrationCount: registrations.length, fixtureCount: fixtures };
    }, { timeout: 30_000 });

    // 픽스처만으로는 운영 콘솔을 열 수 없다 — V1Game 은 이 백필이 만든다(배포 때 한 번 도는 것과
    // 같은 경로). 시드가 만든 대회는 그 배포 이후에 생기므로 여기서 직접 돌려야 한다.
    const backfill = await runFixtureGameBackfill(this.prisma as never, { mode: 'apply' });

    const lineupsSubmitted = withLineups
      ? await this.submitLineups(created.tournament.id, minPlayers)
      : 0;

    await this.adminContext.logAdminAction(admin, {
      action: 'tournament.mock_seed',
      targetType: 'tournament',
      targetId: created.tournament.id,
      reason: `목업 대회 생성 (${format}/${teamCount}팀/${status}${reviewReady ? '/후기가능' : ''})`,
      afterJson: { title, format, teamCount, status, withResults, reviewReady, withLineups },
    });

    return {
      tournamentId: created.tournament.id,
      title,
      format,
      teamCount: created.registrationCount,
      fixtureCount: created.fixtureCount,
      status: created.tournament.status,
      reviewReady,
      route: `/tournaments/${created.tournament.id}`,
      gamesCreated: backfill.counts.gamesCreated,
      lineupsSubmitted,
      // 로그인해서 확인하려면 어떤 계정이 이 대회에 들어가 있는지 알아야 한다.
      // 비밀번호는 응답에 담지 않는다 — 이 저장소는 public 이고 시드 계정은 공통 비밀번호를 쓴다.
      teams: teams.map((team) => ({
        teamId: team.teamId,
        teamName: team.name,
        accounts: team.accounts.slice(0, 8).map((account) => ({
          email: account.email,
          nickname: account.nickname,
          role: account.role,
        })),
      })),
    };
  }

  /**
   * 지금 쓸 수 있는 테스트 팀 수 — 화면이 "몇 팀까지 되는지"를 미리 알려주려면 필요하다.
   * 눌러 보고 나서야 400 으로 알게 되면 사용자가 조건을 스스로 좁힐 수 없다.
   */
  /** 목업 대회의 종목. availability 와 생성이 같은 종목을 봐야 라인업 하한 안내가 실제와 맞는다. */
  private async pickSport() {
    return (
      (await this.prisma.v1Sport.findFirst({ where: { code: 'futsal' }, select: { id: true, code: true } })) ??
      (await this.prisma.v1Sport.findFirst({ select: { id: true, code: true } }))
    );
  }

  async availability() {
    if (!isMockSeedEnabled()) {
      return { enabled: false, usableTeamCount: 0, maxTeamCount: 0, minPlayersPerTeam: 0 };
    }
    const sport = await this.pickSport();
    const config = sport
      ? await this.prisma.v1CompetitionConfigVersion.findFirst({
          where: { status: 'ACTIVE', sportCode: sport.code },
          orderBy: { createdAt: 'desc' },
          select: { lineup: true },
        })
      : null;
    const minPlayers = readLineupMinPlayers(config?.lineup ?? null);
    const usable = await this.findUsableTeams(minPlayers);
    return {
      enabled: true,
      usableTeamCount: usable.length,
      maxTeamCount: Math.min(usable.length, 16),
      minPlayersPerTeam: minPlayers,
    };
  }

  /**
   * 이 대회 경기들의 라인업을 제출 상태로 올린다.
   *
   * 백필이 이미 등록 명단으로 participant 를 만들어 뒀으므로 새로 만들지 않는다 — 앞에서
   * minPlayers 명을 선발로, 1명을 골키퍼로 표시하고 나머지는 후보로 남긴 뒤 라인업을 SUBMITTED
   * 로 올린다. 명단이 minPlayers 에 못 미치는 경기는 건드리지 않는다(반쪽 제출은 화면에서
   * "자리가 비어 있어요"로 보여 오히려 혼란스럽다).
   */
  private async submitLineups(tournamentId: string, minPlayers: number): Promise<number> {
    const games = await this.prisma.v1Game.findMany({
      where: { tournamentFixture: { tournamentId } },
      select: {
        id: true,
        lineups: { where: { state: 'DRAFT' }, select: { id: true, sideId: true, version: true } },
        participants: { select: { id: true, lineupId: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    let submitted = 0;
    for (const game of games) {
      for (const lineup of game.lineups) {
        const roster = game.participants.filter((participant) => participant.lineupId === lineup.id);
        if (roster.length < minPlayers) continue;

        const starters = roster.slice(0, minPlayers);
        await this.prisma.$transaction(async (tx) => {
          await tx.v1GameParticipant.updateMany({
            where: { lineupId: lineup.id },
            data: { started: false, position: null },
          });
          await tx.v1GameParticipant.updateMany({
            where: { id: { in: starters.map((participant) => participant.id) } },
            data: { started: true },
          });
          // 골키퍼는 정확히 1명이어야 한다 — 없으면 제출이 거부된다.
          await tx.v1GameParticipant.update({ where: { id: starters[0].id }, data: { position: 'GK' } });
          await tx.v1GameLineup.update({
            where: { id: lineup.id },
            data: { state: 'SUBMITTED', submittedAt: new Date(), version: { increment: 1 } },
          });
        });
        submitted += 1;
      }
    }
    return submitted;
  }

  /** 대회 이름에 조건이 드러나야 목록에서 어떤 테스트용인지 바로 읽힌다. */
  private autoLabel(format: string, teamCount: number, status: MockSeedStatus, reviewReady: boolean) {
    const formatLabel = format === 'league' ? '리그' : format === 'knockout' ? '토너먼트' : '조별리그+토너먼트';
    const statusLabel = status === 'open' ? '모집중' : status === 'in_progress' ? '진행중' : '종료';
    return `${formatLabel} ${teamCount}팀 ${statusLabel}${reviewReady ? ' 후기가능' : ''}`;
  }

  private stamp(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  /**
   * 명단을 채울 수 있는 팀만 고른다 — active 멤버가 최소 3명 있어야 선수 후기 대상이 생긴다.
   * 팀이 모자라면 조용히 적게 만들지 않고 실패시킨다(반쪽짜리 대회는 검증에 쓸모가 없다).
   */
  private async pickTeams(teamCount: number, minPlayers: number): Promise<SeedTeam[]> {
    const usable = await this.findUsableTeams(minPlayers);
    if (usable.length < teamCount) {
      throw new BadRequestException({
        code: 'NOT_ENOUGH_TEAMS',
        message: `명단을 채울 수 있는 테스트 팀이 부족해요. 필요 ${teamCount}팀, 사용 가능 ${usable.length}팀 (라인업 제출 최소 인원 ${minPlayers}명 이상 + 팀장 보유 + 전원 테스트 계정).`,
      });
    }
    return usable.slice(0, teamCount);
  }

  private async findUsableTeams(minPlayers: number): Promise<SeedTeam[]> {
    const candidates = await this.prisma.v1Team.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        // 라인업을 제출하려면 선발 최소 인원을 채워야 한다 — 그 아래 팀은 애초에 후보가 아니다.
        memberCount: { gte: minPlayers },
        memberships: {
          some: { status: 'active', role: 'owner' },
          // 테스트 팀만 DB 에서 걸러온다. 메모리에서만 걸러내면 take 범위(오래된 팀 순)가
          // 실사용자 팀으로 차서 정작 QA 스쿼드가 후보에 들지 못한다 — 실제로 alpha 에서
          // "사용 가능 1팀" 으로 전부 실패했다.
          every: { user: { email: { endsWith: TEST_ACCOUNT_DOMAIN } } },
        },
      },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { status: 'active' },
          // 테스트하려면 어떤 계정으로 로그인해야 하는지가 결과에 같이 나와야 한다.
          // 닉네임은 V1User 가 아니라 V1UserProfile 에 있다.
          select: { userId: true, role: true, user: { select: { email: true, profile: { select: { nickname: true } } } } },
        },
      },
      orderBy: { createdAt: 'asc' },
      // 창을 teamCount 에 비례시키면 조건을 못 채우는 소규모 테스트 팀들이 창을 차지해
      // 정작 쓸 수 있는 팀이 밀려난다(alpha 실측: 4팀 요청은 창 16이라 실패, 8팀 요청은 창 32라 성공).
      // 후보 판정은 아래 필터가 하고, 조회는 넉넉히 가져온다.
      take: 200,
    });
    const usable = candidates
      .filter(
        (team) =>
          team.memberships.length >= minPlayers &&
          team.memberships.some((m) => m.role === 'owner') &&
          // 한 명이라도 실사용자가 섞여 있으면 통째로 제외한다.
          team.memberships.every((m) => m.user?.email?.endsWith(TEST_ACCOUNT_DOMAIN) === true),
      )
      .map((team) => ({
        teamId: team.id,
        name: team.name,
        ownerUserId: team.memberships.find((m) => m.role === 'owner')!.userId,
        memberUserIds: team.memberships.map((m) => m.userId),
        accounts: team.memberships.map((m) => ({
          userId: m.userId,
          email: m.user?.email ?? '',
          nickname: m.user?.profile?.nickname ?? '',
          role: m.role,
        })),
      }));
    return usable;
  }

  /** 형식별 대진 생성. 리그·조별리그는 라운드로빈, 토너먼트는 단판 브래킷. */
  private async buildFixtures(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    tournamentId: string,
    format: string,
    registrations: Array<{ id: string; sortOrder: number; teamName: string }>,
    withResults: boolean,
    now: Date,
    competitionConfigVersionId: string,
  ): Promise<number> {
    const pairs: Array<{ home: string; away: string; round: string; groupId: string | null }> = [];

    if (format === 'knockout') {
      for (let i = 0; i + 1 < registrations.length; i += 2) {
        pairs.push({ home: registrations[i].id, away: registrations[i + 1].id, round: '8강', groupId: null });
      }
    } else {
      // league / group_knockout — 한 조에 몰아넣고 라운드로빈. 조별리그+토너먼트도 조별 라운드는 같다.
      const group = await tx.v1TournamentGroup.create({
        data: { tournamentId, name: 'A조', sortOrder: 0 },
      });
      await tx.v1TournamentGroupTeam.createMany({
        data: registrations.map((registration) => ({
          groupId: group.id,
          registrationId: registration.id,
          sortOrder: registration.sortOrder,
        })),
      });
      for (let i = 0; i < registrations.length; i += 1) {
        for (let j = i + 1; j < registrations.length; j += 1) {
          pairs.push({ home: registrations[i].id, away: registrations[j].id, round: '조별 리그', groupId: group.id });
        }
      }
      if (format === 'group_knockout' && registrations.length >= 4) {
        pairs.push({ home: registrations[0].id, away: registrations[1].id, round: '4강', groupId: null });
        pairs.push({ home: registrations[2].id, away: registrations[3].id, round: '4강', groupId: null });
      }
    }

    for (const [index, pair] of pairs.entries()) {
      const fixture = await tx.v1TournamentFixture.create({
        data: {
          tournamentId,
          groupId: pair.groupId,
          round: pair.round,
          fixtureNumber: index + 1,
          homeRegistrationId: pair.home,
          awayRegistrationId: pair.away,
          scheduledAt: now,
          venue: '목업 테스트 경기장',
          competitionConfigVersionId,
          status: withResults ? 'completed' : 'scheduled',
        },
      });
      if (withResults) {
        // 후기 대상이 열리려면 공식 결과가 있어야 한다(officialResultTimestamp).
        await tx.v1TournamentFixtureResult.create({
          data: {
            fixtureId: fixture.id,
            homeScore: (index % 3) + 1,
            awayScore: index % 2,
            hasPenalty: false,
            recordedAt: now,
          },
        });
      }
    }
    return pairs.length;
  }
}
