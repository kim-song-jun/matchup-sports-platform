import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AdminContextService, type V1ActiveAdmin } from '../../../src/common/admin-context.service';
import { GamesService } from '../../../src/games/games.service';
import {
  createLeagueFixture,
  loadLeagueTeamRosters,
} from '../../../src/league-matches/league-fixture-creation';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../../src/team-matches/resolve-team-match-competition-config';
import { ManagedTermsRuntimeService } from '../../../src/terms/managed-terms-runtime.service';
import { seedLeagueOnTournamentAxis } from '../../fixtures/league-on-tournament-axis.fixture';
import { seedSupportAdmin } from '../../helpers/bracket-canvas-fixture';

export interface HarnessTeam {
  id: string;
  name: string;
}

export interface HarnessFixtureInput {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeSlotId?: string | null;
  awaySlotId?: string | null;
  startAt?: Date;
  title?: string;
}

/** 리그 자리·빈 경기 통합 스펙의 공통 시드. 스펙마다 손으로 적으면 필드 매핑이 갈린다. */
export async function createLeagueSlotHarness(app: INestApplication, label: string) {
  const prisma = app.get(PrismaService);
  const games = app.get(GamesService);
  const suiteId = randomUUID().slice(0, 8);
  const terms = app.get(ManagedTermsRuntimeService);
  const signupTerms = await terms.currentSignupTerms();
  /** 약관 동의가 없으면 역할과 무관하게 403 이라 권한 테스트가 엉뚱한 이유로 통과한다. */
  const acceptRequiredTerms = (userId: string) =>
    terms.acceptSignupTerms(
      userId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
  const verifiedPhoneAt = new Date('2026-08-01T00:00:00.000Z');
  const adminUserId = `${label}-admin-${suiteId}`;
  await prisma.v1User.create({
    data: { id: adminUserId, email: `${adminUserId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: verifiedPhoneAt, accountStatus: 'active' },
  });
  await acceptRequiredTerms(adminUserId);
  await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
  const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
  const region = await prisma.v1Region.create({ data: { code: `${label}-region-${suiteId}`, name: `${label} 지역`, level: 2 } });
  const config = await resolveTeamMatchCompetitionConfig(prisma, sport.id);
  if (config === null) throw new Error('futsal competition config is missing in the test DB');
  const admin: V1ActiveAdmin = await app.get(AdminContextService).getMutationAdmin(adminUserId);
  let seq = 0;

  return {
    prisma,
    games,
    adminUserId,
    admin,
    sportId: sport.id,
    regionId: region.id,

    /**
     * 팀마다 **자기 팀장 계정**을 따로 만든다 — 한 사용자를 여러 팀 명단에 올리면 리그 자동 명단 채우기가
     * 팀 간 중복 선수로 부딪힌다.
     */
    async makeTeam(name: string): Promise<HarnessTeam> {
      seq += 1;
      const ownerId = `${label}-owner-${suiteId}-${seq}`;
      await prisma.v1User.create({
        data: { id: ownerId, email: `${ownerId}@integration.test`, onboardingStatus: 'completed', accountStatus: 'active' },
      });
      const team = await prisma.v1Team.create({
        data: { ownerUserId: ownerId, sportId: sport.id, regionId: region.id, name: `${name}-${suiteId}-${seq}` },
      });
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerId, role: 'owner', status: 'active' } });
      return { id: team.id, name: team.name };
    },

    /**
     * 약관 동의까지 마친 어드민 계정. support 는 PR-1b 의 `seedSupportAdmin`(test/helpers/bracket-canvas-fixture.ts)을
     * 그대로 쓰고 HTTP 경로에 필요한 휴대폰 인증·약관만 얹는다 — 어드민 시드를 두 벌 두지 않는다.
     */
    async makeAdmin(adminRole: 'owner' | 'ops' | 'support'): Promise<string> {
      seq += 1;
      if (adminRole === 'support') {
        const support = await seedSupportAdmin(prisma, `${label}-support-${suiteId}-${seq}`);
        await prisma.v1User.update({ where: { id: support.id }, data: { phoneVerifiedAt: verifiedPhoneAt } });
        await acceptRequiredTerms(support.id);
        return support.id;
      }
      const userId = `${label}-${adminRole}-${suiteId}-${seq}`;
      await prisma.v1User.create({
        data: { id: userId, email: `${userId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: verifiedPhoneAt, accountStatus: 'active' },
      });
      await acceptRequiredTerms(userId);
      await prisma.v1AdminUser.create({ data: { userId, adminRole } });
      return userId;
    },

    /** 경기가 만들어진 **뒤에** 부르면 명단 자동 채우기와 겹치지 않는다. */
    async joinTeam(userId: string, teamId: string): Promise<void> {
      await prisma.v1TeamMembership.create({ data: { teamId, userId, role: 'member', status: 'active' } });
    },

    /** `teams` 는 확정 등록으로 참가한다. `state` 기본은 draft. */
    async makeLeague(options: { teams?: HarnessTeam[]; state?: 'draft' | 'active' | 'completed' } = {}): Promise<string> {
      seq += 1;
      const league = await seedLeagueOnTournamentAxis(prisma, {
        title: `${label} 리그 ${suiteId}-${seq}`,
        sportId: sport.id,
        regionId: region.id,
        state: options.state ?? 'draft',
        teamIds: (options.teams ?? []).map((team) => team.id),
        appliedByUserId: adminUserId,
      });
      return league.id;
    },

    async makeSlots(leagueId: string, count: number): Promise<Array<{ id: string; position: number }>> {
      const slots: Array<{ id: string; position: number }> = [];
      for (let position = 1; position <= count; position += 1) {
        const row = await prisma.v1TournamentSlot.create({ data: { tournamentId: leagueId, kind: 'ENTRY', position } });
        slots.push({ id: row.id, position: row.position });
      }
      return slots;
    },

    async registrationId(leagueId: string, teamId: string): Promise<string> {
      const row = await prisma.v1TournamentRegistration.findUniqueOrThrow({
        where: { tournamentId_teamId: { tournamentId: leagueId, teamId } },
        select: { id: true },
      });
      return row.id;
    },

    /** 팀·자리를 마음대로 조합한 경기 한 건 — 운영 코드와 같은 `createLeagueFixture` 로 만든다. */
    async createFixture(leagueId: string, input: HarnessFixtureInput = {}): Promise<string> {
      seq += 1;
      const teamIds = [input.homeTeamId, input.awayTeamId].filter((id): id is string => typeof id === 'string');
      return prisma.$transaction(async (tx) => {
        const teams = await loadLeagueTeamRosters(tx, leagueId, teamIds);
        const pick = (teamId: string | null | undefined) => {
          if (typeof teamId !== 'string') return null;
          const team = teams.get(teamId);
          if (team === undefined) throw new Error(`team ${teamId} is not active`);
          return team;
        };
        return createLeagueFixture(tx, games, {
          leagueId,
          adminUserId,
          sportId: sport.id,
          regionId: region.id,
          competitionConfigId: config.id,
          title: input.title ?? `슬롯 하네스 대진 ${seq}`,
          place: { name: '테스트 구장', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null },
          startAt: input.startAt ?? new Date(Date.now() + (seq + 7) * 86_400_000),
          endAt: null,
          home: pick(input.homeTeamId),
          away: pick(input.awayTeamId),
          homeSlotId: input.homeSlotId ?? null,
          awaySlotId: input.awaySlotId ?? null,
        });
      });
    },
  };
}

export type LeagueSlotHarness = Awaited<ReturnType<typeof createLeagueSlotHarness>>;
