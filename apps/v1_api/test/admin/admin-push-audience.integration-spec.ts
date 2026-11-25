import { randomUUID } from 'node:crypto';
import { AdminOpsService } from '../../src/admin/admin-ops.service';
import { buildPushAudienceWhere } from '../../src/admin/admin-push-audience';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 관리자 수동 푸시의 수신 대상 계산을 **실제 Prisma 쿼리**로 본다.
 * 성별 조건은 "프로필 없음 / 빈 값 / male·female 아님" 을 모두 "미입력" 으로 읽어야 하고,
 * 참가팀 조건은 확정(confirmed) 신청 + 활성 팀원 + 삭제 안 된 팀이어야 한다.
 * 이 조건들은 중첩 relation 필터(`NOT … is …`, `some … some`)라 mock 으로는 증명되지 않는다.
 */
describe('admin push audience (real DB)', () => {
  const prisma = new PrismaService();
  const run = randomUUID().slice(0, 8);
  const id = () => randomUUID();
  const users = {
    male: id(), female: id(), noProfile: id(), blankGender: id(), otherGender: id(), nullGender: id(),
    femaleNoticeOff: id(), femaleLeft: id(), femaleSuspended: id(),
    maleOnPendingTeam: id(), femaleOnDeletedTeam: id(), maleNoTeam: id(),
  };
  const sportId = id(); const regionId = id();
  const teams = { confirmed: id(), pending: id(), deleted: id() };
  const tournamentId = id(); const otherTournamentId = id();
  const sent: string[] = [];
  let service: AdminOpsService;

  const admin = { id: id(), userId: users.male, adminRole: 'ops' as const, status: 'active' as const };
  const adminContext = { logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log', statusChangeLogId: null }) };
  const realtime = { emitToUser: jest.fn((userId: string) => { sent.push(userId); }) };
  const webPush = { sendToUser: jest.fn().mockResolvedValue({ subscriptions: 0, delivered: 0, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } }) };
  const mine = Object.values(users);

  async function recipients(input: Parameters<typeof buildPushAudienceWhere>[0]): Promise<string[]> {
    // 같은 DB 의 다른 사용자가 섞이지 않게 이 테스트가 만든 사용자만 본다.
    const rows = await prisma.v1User.findMany({
      where: { AND: [buildPushAudienceWhere(input), { id: { in: mine } }] },
      select: { id: true },
    });
    return rows.map((row) => nameOf(row.id)).sort();
  }
  const nameOf = (userId: string | null) => (Object.entries(users).find(([, value]) => value === userId)?.[0] ?? String(userId));
  const ids = (...keys: Array<keyof typeof users>): string[] => [...keys].sort();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for this integration verification');
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({ where: { name: 'futsal-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (config === null) throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');

    const profile = (nickname: string, gender: string | null) => ({ create: { nickname, gender } });
    const user = (key: keyof typeof users, extra: Record<string, unknown> = {}) => prisma.v1User.create({
      data: { id: users[key], email: `${key}-${run}@push-audience.test`, accountStatus: 'active', onboardingStatus: 'completed', ...extra },
    });
    await user('male', { profile: profile(`m-${run}`, 'male') });
    await user('female', { profile: profile(`f-${run}`, 'female') });
    await user('noProfile');
    await user('blankGender', { profile: profile(`b-${run}`, '') });
    await user('otherGender', { profile: profile(`o-${run}`, 'other') });
    await user('nullGender', { profile: profile(`n-${run}`, null) });
    await user('femaleNoticeOff', { profile: profile(`fn-${run}`, 'female'), notificationPreference: { create: { noticeEnabled: false } } });
    await user('femaleLeft', { profile: profile(`fl-${run}`, 'female') });
    await user('femaleSuspended', { profile: profile(`fs-${run}`, 'female'), accountStatus: 'suspended' });
    await user('maleOnPendingTeam', { profile: profile(`mp-${run}`, 'male') });
    await user('femaleOnDeletedTeam', { profile: profile(`fd-${run}`, 'female') });
    await user('maleNoTeam', { profile: profile(`mn-${run}`, 'male') });

    await prisma.v1Sport.create({ data: { id: sportId, code: 'futsal', name: `push-audience ${run}` } });
    await prisma.v1Region.create({ data: { id: regionId, code: `PA_${run}`, name: `push-audience ${run}`, level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: teams.confirmed, ownerUserId: users.male, sportId, regionId, name: `확정 ${run}` },
        { id: teams.pending, ownerUserId: users.maleOnPendingTeam, sportId, regionId, name: `대기 ${run}` },
        { id: teams.deleted, ownerUserId: users.femaleOnDeletedTeam, sportId, regionId, name: `삭제 ${run}`, deletedAt: new Date() },
      ],
    });
    const member = (teamId: string, key: keyof typeof users, status: 'active' | 'left' = 'active') =>
      ({ teamId, userId: users[key], role: 'member' as const, status });
    await prisma.v1TeamMembership.createMany({
      data: [
        member(teams.confirmed, 'male'), member(teams.confirmed, 'female'), member(teams.confirmed, 'noProfile'),
        member(teams.confirmed, 'blankGender'), member(teams.confirmed, 'otherGender'), member(teams.confirmed, 'nullGender'),
        member(teams.confirmed, 'femaleNoticeOff'), member(teams.confirmed, 'femaleLeft', 'left'), member(teams.confirmed, 'femaleSuspended'),
        member(teams.pending, 'maleOnPendingTeam'),
        member(teams.deleted, 'femaleOnDeletedTeam'),
      ],
    });
    await prisma.v1Tournament.createMany({
      data: [
        { id: tournamentId, sportId, title: `push-audience 대회 ${run}`, competitionConfigVersionId: config.id },
        { id: otherTournamentId, sportId, title: `push-audience 다른 대회 ${run}`, competitionConfigVersionId: config.id },
      ],
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { tournamentId, teamId: teams.confirmed, appliedByUserId: users.male, status: 'confirmed' },
        { tournamentId, teamId: teams.pending, appliedByUserId: users.maleOnPendingTeam, status: 'submitted' },
        { tournamentId, teamId: teams.deleted, appliedByUserId: users.femaleOnDeletedTeam, status: 'confirmed' },
        // 다른 대회에는 확정 팀이 따로 없다 — 이 대회로 보낸 발송이 새어 나가지 않는지 본다.
        { tournamentId: otherTournamentId, teamId: teams.pending, appliedByUserId: users.maleOnPendingTeam, status: 'confirmed' },
      ],
    });
    service = new AdminOpsService(prisma, adminContext as never, realtime as never, webPush as never);
  });

  afterAll(async () => {
    try {
      await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: mine } } });
      await prisma.v1IdempotencyRecord.deleteMany({ where: { actorUserId: admin.userId } });
      await prisma.v1TournamentRegistration.deleteMany({ where: { tournamentId: { in: [tournamentId, otherTournamentId] } } });
      await prisma.v1Tournament.deleteMany({ where: { id: { in: [tournamentId, otherTournamentId] } } });
      await prisma.v1TeamMembership.deleteMany({ where: { teamId: { in: Object.values(teams) } } });
      await prisma.v1Team.deleteMany({ where: { id: { in: Object.values(teams) } } });
      await prisma.v1Region.deleteMany({ where: { id: regionId } });
      await prisma.v1Sport.deleteMany({ where: { id: sportId } });
      await prisma.v1NotificationPreference.deleteMany({ where: { userId: { in: mine } } });
      await prisma.v1UserProfile.deleteMany({ where: { userId: { in: mine } } });
      await prisma.v1User.deleteMany({ where: { id: { in: mine } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('참가팀 + 성별 없음: 확정 팀의 활성 팀원 전원(탈퇴·정지 제외, 대기·삭제 팀 제외)', async () => {
    expect(await recipients({ target: 'competition', competitionId: tournamentId })).toEqual(
      ids('male', 'female', 'noProfile', 'blankGender', 'otherGender', 'nullGender', 'femaleNoticeOff'),
    );
  });

  it('참가팀 + 여성: 여성과 성별 미입력만 받고 남성은 빠진다', async () => {
    expect(await recipients({ target: 'competition', competitionId: tournamentId, gender: 'female' })).toEqual(
      ids('female', 'noProfile', 'blankGender', 'otherGender', 'nullGender', 'femaleNoticeOff'),
    );
  });

  it('참가팀 + 남성: 남성과 성별 미입력만 받고 여성은 빠진다', async () => {
    expect(await recipients({ target: 'competition', competitionId: tournamentId, gender: 'male' })).toEqual(
      ids('male', 'noProfile', 'blankGender', 'otherGender', 'nullGender'),
    );
  });

  it('다른 대회로 보내면 이 대회의 팀원에게 새지 않는다', async () => {
    // 다른 대회에서는 확정이었던 대기 팀만 받는다 — 이 대회(tournamentId)의 확정 팀원은 하나도 섞이지 않는다.
    expect(await recipients({ target: 'competition', competitionId: otherTournamentId })).toEqual(['maleOnPendingTeam']);
  });

  it('전체 회원 + 여성: 팀 소속과 무관하게 여성과 미입력 활성 회원이다(정지 계정 제외)', async () => {
    expect(await recipients({ target: 'broadcast', gender: 'female' })).toEqual(
      ids('female', 'noProfile', 'blankGender', 'otherGender', 'nullGender', 'femaleNoticeOff', 'femaleLeft', 'femaleOnDeletedTeam'),
    );
  });

  it('예상 인원은 후보와 공지 알림을 끈 회원을 따로 센다', async () => {
    const result = await service.previewPushAudience({ target: 'competition', competitionId: tournamentId, gender: 'female' });
    // 다른 사용자가 없는 통합 DB 에서는 내 사용자만 센다 — 그래도 다른 스펙이 남긴 행이 있을 수 있어 내 사용자만으로 다시 센다.
    const own = await prisma.v1User.count({ where: { AND: [buildPushAudienceWhere({ target: 'competition', competitionId: tournamentId, gender: 'female' }), { id: { in: mine } }] } });
    expect(own).toBe(6);
    expect(result.audience).toBeGreaterThanOrEqual(6);
    expect(result.noticeOff).toBeGreaterThanOrEqual(1);
    expect(result.recipients).toBe(result.audience - result.noticeOff);
  });

  it('참가팀 + 여성으로 실제 발송하면 남성 팀원은 알림을 받지 않고, 공지 알림을 끈 회원은 건너뛴다', async () => {
    const result = await service.sendManualPush({ target: 'competition', competitionId: tournamentId, gender: 'female', title: `여자부 안내 ${run}` }, admin);
    expect(result.failed).toBe(0);
    const rows = await prisma.v1Notification.findMany({ where: { title: `여자부 안내 ${run}` }, select: { recipientUserId: true } });
    expect(rows.map((row) => nameOf(row.recipientUserId)).sort()).toEqual(
      ids('female', 'noProfile', 'blankGender', 'otherGender', 'nullGender'),
    );
    expect(result.skipped).toBe(1); // femaleNoticeOff
  });
});
