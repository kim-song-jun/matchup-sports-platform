import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContextService } from '../../common/admin-context.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { isMockSeedEnabled } from './mock-seed.config';
import { CreateMockTournamentDto, type MockSeedStatus } from './mock-tournament-seed.dto';

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
    const withResults = dto.withResults || reviewReady || status === 'completed';

    const sport = await this.prisma.v1Sport.findFirst({ where: { code: 'futsal' } })
      ?? await this.prisma.v1Sport.findFirst({});
    if (!sport) throw new BadRequestException({ code: 'NO_SPORT', message: '종목 데이터가 없어요.' });

    const teams = await this.pickTeams(teamCount);
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
          minPlayers: 3,
          maxPlayers: 12,
          venue: '목업 테스트 경기장',
          scheduledAt: now,
          scheduledEndAt: now,
          registrationDeadlineAt: now,
          entryFee: 0,
          status: status === 'open' ? 'open' : status === 'in_progress' ? 'in_progress' : 'completed',
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
          data: team.memberUserIds.slice(0, 8).map((userId, playerIndex) => ({
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

      const fixtures = await this.buildFixtures(tx, tournament.id, format, registrations, withResults, now);
      return { tournament, registrationCount: registrations.length, fixtureCount: fixtures };
    }, { timeout: 30_000 });

    await this.adminContext.logAdminAction(admin, {
      action: 'tournament.mock_seed',
      targetType: 'tournament',
      targetId: created.tournament.id,
      reason: `목업 대회 생성 (${format}/${teamCount}팀/${status}${reviewReady ? '/후기가능' : ''})`,
      afterJson: { title, format, teamCount, status, withResults, reviewReady },
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
  private async pickTeams(teamCount: number): Promise<SeedTeam[]> {
    const candidates = await this.prisma.v1Team.findMany({
      where: { status: 'active', deletedAt: null, memberships: { some: { status: 'active', role: 'owner' } } },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { status: 'active' },
          // 테스트하려면 어떤 계정으로 로그인해야 하는지가 결과에 같이 나와야 한다.
          select: { userId: true, role: true, user: { select: { email: true, nickname: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: teamCount * 4,
    });
    const usable = candidates
      .filter((team) => team.memberships.length >= 3 && team.memberships.some((m) => m.role === 'owner'))
      .slice(0, teamCount)
      .map((team) => ({
        teamId: team.id,
        name: team.name,
        ownerUserId: team.memberships.find((m) => m.role === 'owner')!.userId,
        memberUserIds: team.memberships.map((m) => m.userId),
        accounts: team.memberships.map((m) => ({
          userId: m.userId,
          email: m.user?.email ?? '',
          nickname: m.user?.nickname ?? '',
          role: m.role,
        })),
      }));
    if (usable.length < teamCount) {
      throw new BadRequestException({
        code: 'NOT_ENOUGH_TEAMS',
        message: `명단을 채울 수 있는 팀이 부족해요. 필요 ${teamCount}팀, 사용 가능 ${usable.length}팀 (active 멤버 3명 이상 + 팀장 보유).`,
      });
    }
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
