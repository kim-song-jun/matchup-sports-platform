import { AdminContextService } from '../../src/common/admin-context.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentPlayersService } from '../../src/tournaments/tournament-players.service';

/**
 * MD-QA #192 — 선출 여부 판정 근거·이전 판정 이어 쓰기·본인 신고를 실제 DB 로 검증한다.
 *
 * 유닛 스펙은 Prisma 를 mock 하므로 새 컬럼(마이그레이션)·FK·`distinct` 조회·감사 로그 JSON 을
 * 하나도 증명하지 않는다. 여기서는 한 사용자가 **두 대회** 명단에 있을 때 앞 대회 판정이 뒤 대회에
 * "제안" 으로만 보이고, 운영자가 누르기 전에는 바뀌지 않는다는 것까지 본다.
 */
const ids = {
  admin: '97100000-0000-4000-8000-000000000001',
  owner: '97100000-0000-4000-8000-000000000002',
  player: '97100000-0000-4000-8000-000000000003',
  sport: '97100000-0000-4000-8000-000000000010',
  region: '97100000-0000-4000-8000-000000000011',
  team: '97100000-0000-4000-8000-000000000020',
  firstTournament: '97100000-0000-4000-8000-000000000030',
  secondTournament: '97100000-0000-4000-8000-000000000031',
  firstRegistration: '97100000-0000-4000-8000-000000000040',
  secondRegistration: '97100000-0000-4000-8000-000000000041',
  firstPlayer: '97100000-0000-4000-8000-000000000100',
  secondPlayer: '97100000-0000-4000-8000-000000000101',
} as const;

const prisma = new PrismaService();
const service = new TournamentPlayersService(prisma, new AdminContextService(prisma));
const authUser = (id: string) => ({
  id, email: `${id}@example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const,
});

describe('선출 여부 판정 근거 (실제 DB, MD-QA #192)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the eligibility evidence integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 프리셋이 필요하다');

    await prisma.v1User.createMany({
      data: [ids.admin, ids.owner, ids.player].map((id, i) => ({
        id,
        email: `eligibility-evidence-${i}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1UserProfile.create({ data: { userId: ids.admin, nickname: '운영김' } });
    const admin = await prisma.v1AdminUser.create({
      data: { userId: ids.admin, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'EE Futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'ELIGIBILITY_EVIDENCE_REGION', name: 'EE Region', level: 1 },
    });
    await prisma.v1Team.create({
      data: { id: ids.team, ownerUserId: ids.owner, sportId: ids.sport, regionId: ids.region, name: 'EE 팀' },
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' },
        { teamId: ids.team, userId: ids.player, role: 'member', status: 'active' },
      ],
    });
    for (const [tournamentId, title] of [
      [ids.firstTournament, '가을 컵'],
      [ids.secondTournament, '겨울 컵'],
    ] as const) {
      await prisma.v1Tournament.create({
        data: {
          id: tournamentId,
          title,
          status: 'open',
          sportId: ids.sport,
          regionId: ids.region,
          createdByAdminUserId: admin.id,
          scheduledAt: new Date(Date.now() + 7 * 86_400_000),
          competitionConfigVersionId: config.id,
        },
      });
    }
    for (const [registrationId, tournamentId, playerId] of [
      [ids.firstRegistration, ids.firstTournament, ids.firstPlayer],
      [ids.secondRegistration, ids.secondTournament, ids.secondPlayer],
    ] as const) {
      await prisma.v1TournamentRegistration.create({
        data: { id: registrationId, tournamentId, teamId: ids.team, appliedByUserId: ids.owner, status: 'confirmed' },
      });
      await prisma.v1TournamentPlayer.create({
        data: { id: playerId, registrationId, userId: ids.player, realName: '홍길동', eligibilityStatus: 'needs_review' },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('판정 + 확인 방법 + 메모를 저장하고, 메모를 생략한 재판정은 메모를 지우지 않는다', async () => {
    await service.updateEligibility(authUser(ids.admin), ids.firstPlayer, {
      eligibilityStatus: 'non_pro', verificationMethod: 'joinkfa', note: '소속내역 동호인 팀만 있음',
    });
    await service.updateEligibility(authUser(ids.admin), ids.firstPlayer, {
      eligibilityStatus: 'non_pro', verificationMethod: 'certificate',
    });

    const row = await prisma.v1TournamentPlayer.findUniqueOrThrow({ where: { id: ids.firstPlayer } });
    expect(row).toMatchObject({
      eligibilityStatus: 'non_pro',
      eligibilityVerificationMethod: 'certificate',
      eligibilityNote: '소속내역 동호인 팀만 있음',
      eligibilityVerifiedByUserId: ids.admin,
    });
    expect(row.eligibilityVerifiedAt).toBeInstanceOf(Date);
    const log = await prisma.v1AdminActionLog.findFirst({
      where: { action: 'player.eligibility', targetId: ids.firstPlayer },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.afterJson).toMatchObject({ eligibilityVerificationMethod: 'certificate', eligibilityVerifiedByUserId: ids.admin });
  });

  it('본인은 판정 전에 신고할 수 있고, 신고는 판정을 바꾸지 않는다', async () => {
    const result = await service.selfDeclareEligibility(authUser(ids.player), ids.secondTournament, ids.secondRegistration, ids.secondPlayer, {
      selfDeclaredStatus: 'pro', consent: true,
    });
    expect(result.selfDeclaredStatus).toBe('pro');
    const row = await prisma.v1TournamentPlayer.findUniqueOrThrow({ where: { id: ids.secondPlayer } });
    expect(row).toMatchObject({ eligibilityStatus: 'needs_review', selfDeclaredStatus: 'pro' });
  });

  it('다음 대회 명단은 이전 판정을 제안만 하고, 운영자가 유지를 눌러야 판정이 된다', async () => {
    const before = await service.listPlayersForAdmin(authUser(ids.admin), ids.secondRegistration);
    expect(before.players[0]).toMatchObject({
      eligibilityStatus: 'needs_review',
      eligibilityAdminReviewed: false,
      selfDeclaredStatus: 'pro',
      previousEligibilityRuling: {
        sourcePlayerId: ids.firstPlayer, eligibilityStatus: 'non_pro', verificationMethod: 'certificate', competitionTitle: '가을 컵',
      },
    });

    await service.carryOverEligibility(authUser(ids.admin), ids.secondPlayer, { sourcePlayerId: ids.firstPlayer });

    const after = await service.listPlayersForAdmin(authUser(ids.admin), ids.secondRegistration);
    expect(after.players[0]).toMatchObject({
      eligibilityStatus: 'non_pro',
      eligibilityVerificationMethod: 'certificate',
      eligibilityNote: '이전 대회(가을 컵) 판정 유지',
      eligibilityAdminReviewed: true,
      eligibilityVerifiedByName: '운영김',
      previousEligibilityRuling: null,
    });
  });

  it('판정 뒤에는 본인 신고도 팀장 수정도 막힌다', async () => {
    await expect(service.selfDeclareEligibility(authUser(ids.player), ids.secondTournament, ids.secondRegistration, ids.secondPlayer, {
      selfDeclaredStatus: 'non_pro', consent: true,
    })).rejects.toMatchObject({ response: { code: 'ELIGIBILITY_ADMIN_REVIEWED' } });
    await expect(service.updatePlayer(authUser(ids.owner), ids.secondTournament, ids.secondRegistration, ids.secondPlayer, {
      eligibilityStatus: 'pro',
    })).rejects.toMatchObject({ response: { code: 'ELIGIBILITY_ADMIN_REVIEWED' } });
  });
});
