import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { seedCompetitionConfigVersions } from '../../src/tournaments/competition-config/competition-config-backfill';
import { leagueMirrorCreateData } from '../../src/tournaments/league-competition-mirror';

/**
 * **거울 행의 공개 조회 — 순위와 상세 둘 다 리그 축에서 만든다.**
 *
 * R1 이후 `v1_tournaments` 에는 정규 리그 시즌의 거울 행(`kind = 'regular_league'`, **id 가
 * 리그 id 와 같다**)이 함께 산다. 그 행에는 조(`V1TournamentGroup`)도 대진
 * (`V1TournamentFixture`)도 없다 — 그것들을 만드는 코드가 전부 `TOURNAMENT_KINDS` 게이트
 * 뒤에 있기 때문이다. 그래서 대회 축 계산을 그대로 태우면 **빈 순위표**가 나온다.
 * 404 보다 나쁘다: 에러가 아니라 "아직 순위가 없다" 로 읽힌다.
 *
 * ## 이 테스트가 잡는 실제 결함
 * 1. **거울 행이 빈 순위표를 돌려주는 것** — 리그 축 분기가 빠지거나 조건이 틀리면 red.
 * 2. **무효(VOID) 대진이 진행률에 새는 것** — `bucketLeagueFixtures` 는 무효를 confirmed·
 *    pending 어느 쪽에도 넣지 않는다. 호출부가 `game.currentOfficialRevision.state` 를
 *    select 에서 빠뜨리면 무효가 *미확정* 으로 섞여 `remaining` 이 부풀고 진행률이 영원히
 *    100% 에 못 닿는다. **fact 유무만으로는 무효와 미확정을 구분할 수 없다** — 둘 다
 *    fact 가 없다.
 *
 * ## 픽스처 (3대진 — 세 갈래를 한 리그에 함께 심는다)
 * ```
 * A vs B   공식 결과 3:1        → confirmed  (A 승점 3)
 * B vs C   리비전 state = VOID  → voided     (어느 쪽에도 안 센다)
 * A vs C   게임 없음            → pending
 * ```
 * 기대 진행률: `total 2 · played 1 · remaining 1` — **무효를 세면 total 3 이 되어 red.**
 */
const ids = {
  adminUserId: '9b000000-0000-4000-8000-000000000001',
  sportId: '9b000000-0000-4000-8000-000000000010',
  regionId: '9b000000-0000-4000-8000-000000000011',
  league: '9b000000-0000-4000-8000-000000000020',
  teamA: '9b000000-0000-4000-8000-000000000030',
  teamB: '9b000000-0000-4000-8000-000000000031',
  teamC: '9b000000-0000-4000-8000-000000000032',
} as const;

const prisma = new PrismaService();

describe('통합 순위 — 정규 리그 거울 행 (real DB)', () => {
  let read: TournamentsReadService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: `${ids.adminUserId}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    const adminUser = await prisma.v1AdminUser.create({
      data: { userId: ids.adminUserId, adminRole: 'ops' },
    });
    await prisma.v1Sport.create({
      data: { id: ids.sportId, code: 'futsal', name: '풋살', isActive: true },
    });
    await prisma.v1Region.create({ data: { id: ids.regionId, code: 'seoul-x', name: '서울X', level: 1 } });
    await seedCompetitionConfigVersions(prisma);

    for (const [id, name] of [
      [ids.teamA, 'A팀'],
      [ids.teamB, 'B팀'],
      [ids.teamC, 'C팀'],
    ] as const) {
      await prisma.v1Team.create({
        data: { id, ownerUserId: ids.adminUserId, sportId: ids.sportId, regionId: ids.regionId, name },
      });
    }

    const league = await prisma.v1League.create({
      data: {
        id: ids.league,
        title: '거울 순위 리그',
        sportId: ids.sportId,
        regionId: ids.regionId,
        createdByAdminUserId: adminUser.id,
        state: 'active',
        startsOn: new Date('2026-09-01T00:00:00.000Z'),
        endsOn: new Date('2026-09-30T00:00:00.000Z'),
        tieBreakJson: { order: ['points', 'goalDifference', 'goalsFor', 'headToHead'] },
        teams: { create: [{ teamId: ids.teamA }, { teamId: ids.teamB }, { teamId: ids.teamC }] },
      },
    });

    // 거울 행은 **프로덕션과 같은 함수로** 만든다. 손으로 적으면 id 가 리그 id 와 같다는
    // 계약이 픽스처에서만 지켜지고, 그 계약이 깨져도 이 테스트는 green 으로 남는다.
    await prisma.v1Tournament.create({
      data: leagueMirrorCreateData({
        id: league.id,
        sportId: league.sportId,
        title: league.title,
        state: league.state,
        regionId: league.regionId,
        startsOn: league.startsOn,
        endsOn: league.endsOn,
        seriesId: league.seriesId,
        tier: league.tier,
        seasonNo: league.seasonNo,
        sportCode: 'futsal',
        // **실물 값을 넘긴다** — `new Date()` 를 넣으면 이 픽스처가 만드는 거울이 실물과
        // 달라진다(거울의 createdAt 은 원본 리그의 것이어야 한다는 게 이 헬퍼의 계약이다).
        // 픽스처가 실물과 다르면 여기서 통과하는 것이 프로덕션을 증명하지 못한다.
        createdAt: league.createdAt,
      }),
    });

    await createConfirmedFixture('A-B 확정', ids.teamA, ids.teamB, 3, 1);
    await createVoidedFixture('B-C 무효', ids.teamB, ids.teamC);
    await prisma.v1TeamMatch.create({
      data: {
        hostTeamId: ids.teamA,
        createdByUserId: ids.adminUserId,
        sportId: ids.sportId,
        regionId: ids.regionId,
        title: 'A-C 미확정',
        placeName: '미정',
        startAt: new Date('2026-09-20T09:00:00.000Z'),
        status: 'matched',
        approvedApplicantTeamId: ids.teamC,
        leagueId: ids.league,
      },
    });

    read = new TournamentsReadService(prisma, new TournamentStaffAccessService(prisma));
  });

  // **정리하지 않는다.** 통합 스위트는 파일마다 격리된 DB 클론에서 돌고
  // (`test/helpers/isolated-integration-environment.cjs`) 그 클론은 teardown 에서 통째로
  // 드롭된다. 게다가 확정·무효(OFFICIAL/VOID) 리비전은 DB 트리거가 삭제를 막는다
  // ("terminal result revisions are immutable") — 손으로 지우려 들면 그 트리거와 싸우게 된다.
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('거울 행 id 로 리그 순위가 나온다 — 빈 표가 아니다', async () => {
    const res = await read.getOverallStandings(ids.league);

    // 리그 팀 3개가 모두 행으로 나온다. 대회 축 계산을 그대로 태우면 여기가 0 이다.
    expect(res.standings).toHaveLength(3);
    const byTeam = new Map(
      (res.standings as Array<{ teamId?: string; teamName: string; points: number }>).map((row) => [
        row.teamId,
        row,
      ]),
    );
    expect(byTeam.get(ids.teamA)).toMatchObject({ teamName: 'A팀', points: 3 });
    expect(byTeam.get(ids.teamB)).toMatchObject({ teamName: 'B팀', points: 0 });
    expect(byTeam.get(ids.teamC)).toMatchObject({ teamName: 'C팀', points: 0 });
  });

  it('행 모양 — teamId 를 싣고 registrationId·fairPlayPoints 는 없다', async () => {
    const res = await read.getOverallStandings(ids.league);
    const row = res.standings[0] as Record<string, unknown>;

    // 리그엔 참가 등록 개념이 없다. teamId 를 `registrationId` 라는 이름에 담으면 값은
    // 전달되지만 이름이 내용과 갈린 상태가 남고, 그 값으로 등록을 조회하는 코드가 생기는
    // 순간 터진다. `fairPlayPoints` 는 리그가 집계 자체를 하지 않으므로 0(= "감점 없음")이
    // 아니라 **부재**여야 한다.
    expect(row).toHaveProperty('teamId');
    expect(row).not.toHaveProperty('registrationId');
    expect(row).not.toHaveProperty('fairPlayPoints');
    // 매직넘버는 대회 축의 잔여 경기 계산에 묶여 있다 — 리그에 지어내지 않는다.
    expect(res.magicNumber).toBeNull();
    expect(res.recalculatedAt).toBeNull();
  });

  it('상세 조회가 열린다 — 거울 행 id 로 200 이고, 리그 대진이 실려 온다', async () => {
    // **문(get 게이트)이 열렸는지**를 보는 단언이다. 닫혀 있으면 TOURNAMENT_NOT_FOUND 다.
    const detail = (await read.get(ids.league)) as {
      id: string;
      kind: string | null;
      fixtures: unknown[];
      leagueFixtures: Array<{ teamMatchId: string; placeName: string; status: string }>;
    };

    expect(detail.id).toBe(ids.league);
    expect(detail.kind).toBe('regular_league');

    // 대회 축 대진은 거울에 하나도 없다 — 그래서 리그 축 목록이 필요했다.
    expect(detail.fixtures).toEqual([]);
    // 취소·무효 대진도 **목록에는 남는다**(순위에서만 빠진다). 심은 3개가 다 나와야 한다.
    expect(detail.leagueFixtures).toHaveLength(3);
    expect(detail.leagueFixtures.every((f) => f.placeName === '미정')).toBe(true);
  });


  it('진행률 — 무효 대진은 played 에도 remaining 에도 세지 않는다', async () => {
    const res = await read.getOverallStandings(ids.league);

    // 심은 대진은 3개인데 하나가 무효다. 무효를 미확정으로 섞으면 total 3 · remaining 2 가
    // 되어 이 단언이 red 가 된다 — 그게 이 테스트의 목적이다.
    expect(res.progress).toEqual({ total: 2, played: 1, remaining: 1, percent: 50 });
    expect(res.progress.played + res.progress.remaining).toBe(res.progress.total);
  });
});

async function createConfirmedFixture(
  title: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
) {
  const teamMatch = await prisma.v1TeamMatch.create({
    data: {
      hostTeamId: homeTeamId,
      createdByUserId: ids.adminUserId,
      sportId: ids.sportId,
      regionId: ids.regionId,
      title,
      placeName: '미정',
      startAt: new Date('2026-09-05T09:00:00.000Z'),
      status: 'matched',
      approvedApplicantTeamId: awayTeamId,
      leagueId: ids.league,
    },
  });
  const game = await prisma.v1Game.create({
    data: {
      sourceType: 'TEAM_MATCH',
      teamMatchId: teamMatch.id,
      competitionConfigVersionId: await futsalConfigVersionId(),
      // 확정 사실(fact)의 home/away 팀은 **게임 사이드에서 검증된다** — DB 트리거가
      // `v1_game_sides` 의 HOME/AWAY 와 정확히 같은지 대조하고 다르면 거부한다
      // ("official fact must exactly snapshot its official game revision").
      sides: {
        create: [
          { sideKey: 'HOME', teamId: homeTeamId, displayNameSnapshot: '홈' },
          { sideKey: 'AWAY', teamId: awayTeamId, displayNameSnapshot: '원정' },
        ],
      },
    },
  });
  const officialAt = new Date('2026-09-05T11:00:00.000Z');
  const score = { home: homeScore, away: awayScore };
  const eventsHash = `overall-${title}`;
  const revision = await prisma.v1GameResultRevision.create({
    data: {
      gameId: game.id,
      revision: 1,
      state: 'OFFICIAL',
      score,
      eventsHash,
      // 트리거는 `official_at IS NULL` 인 리비전에 fact 를 붙이는 것을 거부한다.
      officialAt,
      createdByActorType: 'USER',
      createdByUserId: ids.adminUserId,
    },
  });
  await prisma.v1Game.update({
    where: { id: game.id },
    data: { currentOfficialRevisionId: revision.id },
  });
  // fact 는 리비전의 **정확한 스냅샷**이어야 한다(트리거가 필드별로 대조한다) —
  // revision/score/eventsHash/officialAt 를 같은 값에서 만든다.
  await prisma.v1GameOfficialFact.create({
    data: {
      revisionId: revision.id,
      gameId: game.id,
      revision: 1,
      sourceType: 'TEAM_MATCH',
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
      score,
      eventsHash,
      officialAt,
    },
  });
}

/**
 * 무효 대진 — 리비전은 있는데 `state = VOID` 라 **fact 가 없다.** 미확정 대진도 fact 가
 * 없으므로, `state` 를 읽지 않으면 이 둘이 화면에서 같아진다.
 */
async function createVoidedFixture(title: string, homeTeamId: string, awayTeamId: string) {
  const teamMatch = await prisma.v1TeamMatch.create({
    data: {
      hostTeamId: homeTeamId,
      createdByUserId: ids.adminUserId,
      sportId: ids.sportId,
      regionId: ids.regionId,
      title,
      placeName: '미정',
      startAt: new Date('2026-09-10T09:00:00.000Z'),
      status: 'matched',
      approvedApplicantTeamId: awayTeamId,
      leagueId: ids.league,
    },
  });
  const game = await prisma.v1Game.create({
    data: {
      sourceType: 'TEAM_MATCH',
      teamMatchId: teamMatch.id,
      competitionConfigVersionId: await futsalConfigVersionId(),
    },
  });
  const revision = await prisma.v1GameResultRevision.create({
    data: {
      gameId: game.id,
      revision: 1,
      state: 'VOID',
      score: { home: 0, away: 0 },
      eventsHash: `overall-${title}`,
      createdByActorType: 'USER',
      createdByUserId: ids.adminUserId,
    },
  });
  await prisma.v1Game.update({
    where: { id: game.id },
    data: { currentOfficialRevisionId: revision.id },
  });
}

/**
 * 게임에 붙일 설정 버전 — **활성 최신본**을 고른다.
 *
 * `createdAt` 오름차순 첫 행을 고르면 과거 버전이 하나라도 더 생기거나 시드 순서가 바뀌는
 * 순간 **비활성·옛 버전**을 잡는다. 그러면 이 PR 과 무관한 이유로 red 가 뜨고, 다음 사람은
 * 리그 순위 경로를 의심하게 된다. 다른 통합 스펙(`tournament-surface-kind`)이 이미
 * `status='ACTIVE'` + 최신 `version` 을 쓰므로 그쪽과 같은 규칙으로 맞춘다 — 같은 질문에
 * 두 답을 두지 않는다.
 *
 * 이 파일에서 설정 버전을 고르는 자리는 **여기 하나뿐**이고 호출부는 2곳(확정·무효 픽스처)
 * 이라, 규칙이 둘로 갈릴 여지가 없다.
 */
async function futsalConfigVersionId(): Promise<string> {
  const sport = await prisma.v1Sport.findUniqueOrThrow({ where: { id: ids.sportId } });
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { sportCode: sport.code, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  return config.id;
}
