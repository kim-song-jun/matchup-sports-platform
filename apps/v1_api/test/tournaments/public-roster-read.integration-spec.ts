import { PrismaService } from '../../src/prisma/prisma.service';
import { readPublicRostersForRegistrations } from '../../src/tournaments/public-roster';

/**
 * **공개 명단 raw 조회를 실제 DB 로 검증한다.**
 *
 * 유닛 스펙은 `$queryRaw` 를 mock 하므로 **SQL 을 하나도 증명하지 않는다** — 조인 대상 테이블,
 * 캐스팅, `WHERE` 조건 어느 것도. 이 저장소는 그걸로 배포 후 500 을 낸 전례가 있다
 * (`registration_id` 가 `text` 인데 `::uuid[]` 로 캐스팅해 쿼리 전체가 죽었다).
 *
 * 특히 **등번호를 안 단 선수가 살아남는지**는 여기서만 잡힌다. mock 은 시킨 행을 그대로
 * 돌려주므로 `AND jersey_number IS NOT NULL` 을 넣어도 유닛은 통과한다.
 */
const ids = {
  admin: '97000000-0000-4000-8000-000000000001',
  owner: '97000000-0000-4000-8000-000000000002',
  withNickname: '97000000-0000-4000-8000-000000000003',
  withoutProfile: '97000000-0000-4000-8000-000000000004',
  sport: '97000000-0000-4000-8000-000000000010',
  region: '97000000-0000-4000-8000-000000000011',
  team: '97000000-0000-4000-8000-000000000020',
  otherTeam: '97000000-0000-4000-8000-000000000021',
  tournament: '97000000-0000-4000-8000-000000000030',
  registration: '97000000-0000-4000-8000-000000000040',
  otherRegistration: '97000000-0000-4000-8000-000000000041',
} as const;

const prisma = new PrismaService();

describe('공개 명단 raw 조회 (실제 DB)', () => {
  let rosters: Map<string, Array<{ id: string; jerseyNumber: number | null; nickname: string | null }>>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the public-roster read integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 프리셋이 필요하다');

    await prisma.v1User.createMany({
      data: [ids.admin, ids.owner, ids.withNickname, ids.withoutProfile].map((id, i) => ({
        id,
        email: `public-roster-${i}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    // 한 명은 닉네임이 있고, 한 명은 **프로필 자체가 없다**(탈퇴·프로필 삭제 상태).
    await prisma.v1UserProfile.create({ data: { userId: ids.withNickname, nickname: '길동이' } });

    const admin = await prisma.v1AdminUser.create({
      data: { userId: ids.admin, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'PR Futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'PUBLIC_ROSTER_REGION', name: 'PR Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.team, ownerUserId: ids.owner, sportId: ids.sport, regionId: ids.region, name: 'PR 팀' },
        // 한 대회에 같은 팀으로 두 번 등록할 수 없다(`(tournament_id, team_id)` unique).
        { id: ids.otherTeam, ownerUserId: ids.owner, sportId: ids.sport, regionId: ids.region, name: 'PR 다른 팀' },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        title: '공개 명단 조회 대회',
        sportId: ids.sport,
        regionId: ids.region,
        createdByAdminUserId: admin.id,
        scheduledAt: new Date(Date.now() + 7 * 86_400_000),
        competitionConfigVersionId: config.id,
      },
    });
    for (const [registrationId, teamId] of [
      [ids.registration, ids.team],
      [ids.otherRegistration, ids.otherTeam],
    ] as const) {
      await prisma.v1TournamentRegistration.create({
        data: {
          id: registrationId,
          tournamentId: ids.tournament,
          teamId,
          appliedByUserId: ids.owner,
          status: 'confirmed',
        },
      });
    }

    // 등번호 있는 선수 · **없는 선수** · 제외된 선수 · 다른 등록의 선수
    await prisma.$executeRaw`
      INSERT INTO "v1_tournament_players"
        (id, registration_id, user_id, real_name, jersey_number, removed_at, added_at, updated_at)
      VALUES
        ('97000000-0000-4000-8000-000000000100', ${ids.registration}, ${ids.withNickname}, '홍길동', 7, NULL, NOW(), NOW()),
        ('97000000-0000-4000-8000-000000000101', ${ids.registration}, ${ids.withoutProfile}, '김철수', NULL, NULL, NOW(), NOW()),
        ('97000000-0000-4000-8000-000000000102', ${ids.registration}, ${ids.owner}, '박제외', 9, NOW(), NOW(), NOW()),
        ('97000000-0000-4000-8000-000000000103', ${ids.otherRegistration}, ${ids.owner}, '이타팀', 11, NULL, NOW(), NOW())
    `;

    rosters = await readPublicRostersForRegistrations(prisma, [ids.registration, ids.otherRegistration]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('등번호를 안 단 선수도 명단에 남는다 — SQL 에 IS NOT NULL 을 걸면 사라진다', () => {
    const roster = rosters.get(ids.registration);
    expect(roster).toEqual([
      { id: '97000000-0000-4000-8000-000000000100', jerseyNumber: 7, nickname: '길동이' },
      // 프로필이 없으면 `null` — 실명(`real_name`)으로 폴백하지 않는다(정본 §3).
      { id: '97000000-0000-4000-8000-000000000101', jerseyNumber: null, nickname: null },
    ]);
  });

  it('제외된 선수는 안 나오고, 등록 단위로 갈린다', () => {
    // 제외(`removed_at`)된 '박제외' 가 위 목록에 없다는 것은 첫 테스트의 `toEqual` 이 이미 잡는다.
    expect(rosters.get(ids.otherRegistration)).toHaveLength(1);
    expect(rosters.get(ids.otherRegistration)?.[0]?.jerseyNumber).toBe(11);
  });

  it('빈 목록이면 쿼리를 아예 안 던진다', async () => {
    const empty = await readPublicRostersForRegistrations(prisma, []);
    expect(empty.size).toBe(0);
  });
});
