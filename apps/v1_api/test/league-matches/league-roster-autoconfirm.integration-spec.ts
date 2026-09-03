import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { LeagueRosterAutoConfirmService } from '../../src/jobs/league-roster/league-roster-autoconfirm.service';

/**
 * D10 (Task 164 BE-4b) — 시즌 시작 자동 명단 확정.
 *
 * 이 잡이 만드는 것은 **대회 참가 자격 명단**(`V1TournamentPlayer`)이다. Task 163 이 다루는
 * 경기별 출석 명단(`V1GameLineup`, 등번호가 붙는 그것)과 다른 층이다.
 *
 * 핸들러는 `DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON !== 'false'` 면 **즉시 return** 한다
 * (배포 기본값 = 꺼짐). 그래서 모든 케이스가 그 env 를 명시적으로 켠 상태에서 돈다 —
 * 끄고 도는 것 자체도 한 케이스로 잰다.
 */
describe('D10 리그 명단 자동 확정', () => {
  const suiteId = randomUUID().slice(0, 8);
  const adminUserId = `t164-autoconf-admin-${suiteId}`;
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let adminId: string;
  let regionId: string;
  const service = new LeagueRosterAutoConfirmService();
  const originalEnv = process.env.DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: {
        id: adminUserId,
        email: `${adminUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const signup = await terms.currentSignupTerms();
    await terms.acceptSignupTerms(
      adminUserId,
      signup.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    // `V1League.createdByAdminUserId` 는 `V1AdminUser.id` 를 가리킨다(userId 가 아니다).
    const admin = await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
    adminId = admin.id;
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t164-autoconf-region-${suiteId}`, name: 'D10 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => {
    process.env.DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON = originalEnv;
    await cleanup?.();
  });

  beforeEach(() => {
    process.env.DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON = 'false'; // 켬
  });

  let seq = 0;
  /** 프로필이 완전한(=자격 통과) 멤버. */
  async function makeMember(teamId: string, opts: { complete: boolean; gender?: 'male' | 'female' } = { complete: true }) {
    seq += 1;
    const userId = `t164-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id: userId,
        email: `${userId}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: opts.complete ? `0100000${String(seq).padStart(4, '0')}` : null,
        phoneVerifiedAt: opts.complete ? new Date('2026-08-01T00:00:00.000Z') : null,
        profile: {
          create: {
            nickname: `선수${seq}`,
            realName: opts.complete ? `선수${seq}` : null,
            birthDate: opts.complete ? '1995-01-01' : null,
            gender: opts.gender ?? 'male',
          },
        },
      },
    });
    await prisma.v1TeamMembership.create({
      data: { teamId, userId, role: 'member', status: 'active', joinedAt: new Date(Date.now() + seq * 1000) },
    });
    return userId;
  }

  async function seedLeague(opts: { members: number; incompleteMembers?: number; maxPlayers?: number }) {
    seq += 1;
    const team = await prisma.v1Team.create({
      data: { ownerUserId: adminUserId, sportId, regionId, name: `t164-team-${suiteId}-${seq}` },
    });
    for (let i = 0; i < opts.members; i += 1) await makeMember(team.id, { complete: true });
    for (let i = 0; i < (opts.incompleteMembers ?? 0); i += 1) await makeMember(team.id, { complete: false });

    const startsOn = new Date('2026-10-01T00:00:00.000Z');
    const league = await prisma.v1League.create({
      data: {
        title: `D10 리그 ${suiteId}-${seq}`,
        sportId,
        regionId,
        createdByAdminUserId: adminId,
        startsOn,
        endsOn: new Date('2026-11-01T00:00:00.000Z'),
        tieBreakJson: { order: ['points'] },
        teams: { create: [{ teamId: team.id }] },
      },
    });
    // 거울(통합 축) — 등록의 tournamentId 가 이 행을 가리킨다.
    await prisma.v1Tournament.create({
      data: {
        id: league.id,
        kind: 'regular_league',
        sportId,
        regionId,
        title: league.title,
        status: 'open',
        ...(opts.maxPlayers === undefined ? {} : { maxPlayers: opts.maxPlayers }),
      },
    });
    const registration = await prisma.v1TournamentRegistration.create({
      data: { tournamentId: league.id, teamId: team.id, appliedByUserId: adminUserId, status: 'confirmed' },
    });
    return { league, team, registration, startsOn };
  }

  const claimFor = (leagueId: string, startsOn: Date) =>
    ({ payload: { leagueId, expectedStartsOn: startsOn.toISOString() } }) as never;

  async function run(leagueId: string, startsOn: Date) {
    await prisma.$transaction((tx) => service.handler(claimFor(leagueId, startsOn), tx as never) as Promise<void>);
  }

  it('명단 미제출 팀에 자격 통과 멤버만 등록하고 rosterAutoConfirmedAt 을 남긴다', async () => {
    const { league, registration, startsOn } = await seedLeague({ members: 3, incompleteMembers: 2 });

    await run(league.id, startsOn);

    const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registration.id } });
    // 프로필이 미비한 2명은 **빠진다** — 크론이 자격 가드를 우회하면 실명 없는 선수가
    // 명단에 올라간다(그 가드는 사용자가 없앤 적 없는 규칙이다).
    expect(players).toHaveLength(3);
    expect(players.every((p) => p.eligibilityStatus === 'needs_review')).toBe(true);

    const [row] = await prisma.$queryRaw<Array<{ at: Date | null }>>`
      SELECT roster_auto_confirmed_at AS at FROM v1_tournament_registrations WHERE id = ${registration.id}
    `;
    expect(row.at).not.toBeNull();
  });

  it('두 번 돌아도 명단은 1건이다 (멱등)', async () => {
    const { league, registration, startsOn } = await seedLeague({ members: 2 });

    await run(league.id, startsOn);
    await run(league.id, startsOn);

    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(2);
  });

  it('이미 명단을 제출한 팀은 건드리지 않는다', async () => {
    const { league, registration, startsOn, team } = await seedLeague({ members: 3 });
    const [firstMember] = await prisma.v1TeamMembership.findMany({ where: { teamId: team.id, role: 'member' }, take: 1 });
    await prisma.v1TournamentPlayer.create({
      data: { registrationId: registration.id, userId: firstMember.userId, realName: '직접 등록', eligibilityStatus: 'non_pro' },
    });

    await run(league.id, startsOn);

    const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registration.id } });
    // 한 명이라도 올린 팀은 대상이 아니다 — 자동으로 나머지를 채우면 팀이 의도적으로
    // 뺀 사람이 도로 들어간다.
    expect(players).toHaveLength(1);
    expect(players[0].eligibilityStatus).toBe('non_pro');
    const [row] = await prisma.$queryRaw<Array<{ at: Date | null }>>`
      SELECT roster_auto_confirmed_at AS at FROM v1_tournament_registrations WHERE id = ${registration.id}
    `;
    expect(row.at).toBeNull();
  });

  it('한 번 올렸다가 전원 뺀 팀은 미제출로 보지 않는다 (제거된 선수 row 가 남아 있다)', async () => {
    // `players: { none: { removedAt: null } }` 로 잡으면 이 팀이 "명단 0명" 으로 보여
    // 자동 확정 대상이 된다 — 운영자가 손으로 비운 명단을 도로 채우는 셈이다. 정본의
    // "미제출" 은 **선수 row 자체가 없는** 팀이다(2026-09-03 정책 확정).
    const { league, registration, startsOn, team } = await seedLeague({ members: 3 });
    const [firstMember] = await prisma.v1TeamMembership.findMany({ where: { teamId: team.id, role: 'member' }, take: 1 });
    await prisma.v1TournamentPlayer.create({
      data: {
        registrationId: registration.id,
        userId: firstMember.userId,
        realName: '뺀 선수',
        eligibilityStatus: 'non_pro',
        removedAt: new Date(),
      },
    });

    await run(league.id, startsOn);

    const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registration.id } });
    expect(players).toHaveLength(1);
    expect(players[0].removedAt).not.toBeNull();
    const [row] = await prisma.$queryRaw<Array<{ at: Date | null }>>`
      SELECT roster_auto_confirmed_at AS at FROM v1_tournament_registrations WHERE id = ${registration.id}
    `;
    expect(row.at).toBeNull();
  });

  it('참가가 확정되지 않은 등록(submitted·awaiting_payment)은 채우지 않는다', async () => {
    // `status: { notIn: ['cancelled','cancel_requested'] }` 로 잡으면 결제도 안 끝난 팀의
    // 명단이 자동으로 선다. 자동 확정은 confirmed 등록에만 해당한다.
    for (const status of ['submitted', 'awaiting_payment', 'waitlisted'] as const) {
      const { league, registration, startsOn } = await seedLeague({ members: 3 });
      await prisma.v1TournamentRegistration.update({ where: { id: registration.id }, data: { status } });

      await run(league.id, startsOn);

      const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registration.id } });
      expect(players).toHaveLength(0);
      const [row] = await prisma.$queryRaw<Array<{ at: Date | null }>>`
        SELECT roster_auto_confirmed_at AS at FROM v1_tournament_registrations WHERE id = ${registration.id}
      `;
      expect(row.at).toBeNull();
    }
  });

  it('자격 통과 멤버가 0명이면 명단을 만들지 않고 표식도 남기지 않는다', async () => {
    const { league, registration, startsOn } = await seedLeague({ members: 0, incompleteMembers: 2 });

    await run(league.id, startsOn);

    // 빈 명단을 만들면 대진은 생기는데 뛸 사람이 없는 상태가 된다.
    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(0);
    const [row] = await prisma.$queryRaw<Array<{ at: Date | null }>>`
      SELECT roster_auto_confirmed_at AS at FROM v1_tournament_registrations WHERE id = ${registration.id}
    `;
    expect(row.at).toBeNull();
  });

  it('정원을 넘으면 가입 순 상위 N명만 등록한다', async () => {
    const { league, registration, startsOn } = await seedLeague({ members: 5, maxPlayers: 3 });

    await run(league.id, startsOn);

    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(3);
  });

  it('대진이 이미 생성된 리그는 건드리지 않는다 (대진 생성 전에만 돈다)', async () => {
    const { league, registration, startsOn, team } = await seedLeague({ members: 3 });
    await prisma.v1TeamMatch.create({
      data: {
        hostTeamId: team.id,
        sportId,
        regionId,
        title: '이미 만든 대진',
        startAt: startsOn,
        placeName: '테스트 구장',
        createdByUserId: adminUserId,
        leagueId: league.id,
      },
    });

    await run(league.id, startsOn);

    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(0);
  });

  it('플래그가 꺼져 있으면(기본값) 아무것도 하지 않는다', async () => {
    const { league, registration, startsOn } = await seedLeague({ members: 3 });
    delete process.env.DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON; // 기본 = 꺼짐

    await run(league.id, startsOn);

    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(0);
  });

  it('시작일이 바뀐 리그의 옛 세대 발화는 스스로 no-op 한다', async () => {
    const { league, registration, startsOn } = await seedLeague({ members: 3 });
    await prisma.v1League.update({
      where: { id: league.id },
      data: { startsOn: new Date('2026-10-15T00:00:00.000Z') },
    });

    await run(league.id, startsOn); // 옛 세대 시각으로 발화

    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id } })).toBe(0);
  });
});
