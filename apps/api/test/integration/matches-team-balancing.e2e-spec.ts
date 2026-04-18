import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as supertest from 'supertest';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';

// ---------------------------------------------------------------------------
// Integration tests: ELO-aware team balancing — preview (dry-run) + generateTeams
// ---------------------------------------------------------------------------

jest.setTimeout(30000);

describe('Matches Team Balancing (e2e)', () => {
  let app: INestApplication;
  let request: supertest.Agent;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  async function ensureVenueId(): Promise<string> {
    const venue = await prisma.venue.create({
      data: {
        name: 'Balancing Test Venue',
        type: 'futsal_court',
        sportTypes: ['futsal'],
        address: '서울시 테스트구',
        lat: 37.5,
        lng: 126.9,
        city: '서울',
        district: '마포구',
        operatingHours: {},
        imageUrls: [],
        facilities: [],
      },
    });
    return venue.id;
  }

  /**
   * Creates a match via API as the given host and returns the matchId.
   */
  async function createMatch(hostToken: string, venueId: string): Promise<string> {
    const res = await request
      .post('/api/v1/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sportType: 'futsal',
        title: 'Balancing Test Match',
        venueId,
        matchDate: '2026-06-01',
        startTime: '10:00',
        endTime: '12:00',
        maxPlayers: 12,
        fee: 0,
      });
    expect(res.status).toBe(201);
    return (res.body.data as { id: string }).id;
  }

  /**
   * Creates a user via dev-login and joins the match as a confirmed participant.
   * Returns the userId.
   */
  async function joinAndConfirm(
    participantNickname: string,
    matchId: string,
    eloRating?: number,
  ): Promise<string> {
    const token = await devLoginToken(request, participantNickname);
    const joinRes = await request
      .post(`/api/v1/matches/${matchId}/join`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(joinRes.status);

    // Confirm the participant directly in DB (bypass payment flow)
    const user = await prisma.user.findFirst({ where: { nickname: participantNickname } });
    expect(user).not.toBeNull();
    await prisma.matchParticipant.updateMany({
      where: { matchId, userId: user!.id },
      data: { status: 'confirmed' },
    });

    // Optionally set ELO rating
    if (eloRating !== undefined) {
      await prisma.userSportProfile.upsert({
        where: { userId_sportType: { userId: user!.id, sportType: 'futsal' } },
        create: { userId: user!.id, sportType: 'futsal', eloRating, level: 3 },
        update: { eloRating },
      });
    }

    return user!.id;
  }

  // ── test 1: preview returns balanced teams ─────────────────────────────────

  describe('POST /api/v1/matches/:id/teams/preview', () => {
    it('returns balanced 2-team distribution for host with 10 participants + known ELOs', async () => {
      const hostToken = await devLoginToken(request, 'balance_host_1');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      // Confirm host as participant
      const hostUser = await prisma.user.findFirst({ where: { nickname: 'balance_host_1' } });
      expect(hostUser).not.toBeNull();
      await prisma.userSportProfile.upsert({
        where: { userId_sportType: { userId: hostUser!.id, sportType: 'futsal' } },
        create: { userId: hostUser!.id, sportType: 'futsal', eloRating: 1400, level: 5 },
        update: { eloRating: 1400 },
      });

      const eloPool = [1350, 1300, 1250, 1200, 900, 850, 800, 750, 700];
      for (let i = 0; i < eloPool.length; i++) {
        await joinAndConfirm(`balance_p_${i + 1}`, matchId, eloPool[i]);
      }

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 42 });

      expect(res.status).toBe(200);

      const data = res.body.data as {
        teams: Array<{ index: number; name: string; members: unknown[]; avgElo: number }>;
        metrics: { maxEloGap: number; stdDev: number; coldStartCount: number };
        seed: number;
      };

      expect(data.teams).toHaveLength(2);
      expect(data.teams[0].members.length + data.teams[1].members.length).toBe(10);
      expect(data.metrics).toHaveProperty('maxEloGap');
      expect(data.metrics).toHaveProperty('stdDev');
      expect(data.metrics.coldStartCount).toBe(0);
      expect(data.seed).toBe(42);
    });

    // ── test 2: preview does NOT mutate DB ───────────────────────────────────

    it('does not create Team rows or update MatchParticipant.teamId', async () => {
      const hostToken = await devLoginToken(request, 'dry_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      await joinAndConfirm('dry_p1', matchId, 1200);
      await joinAndConfirm('dry_p2', matchId, 1100);
      await joinAndConfirm('dry_p3', matchId, 1000);
      await joinAndConfirm('dry_p4', matchId, 900);

      await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 7 });

      const teamCount = await prisma.team.count({ where: { matchId } });
      expect(teamCount).toBe(0);

      const participantsWithTeam = await prisma.matchParticipant.findMany({
        where: { matchId, teamId: { not: null } },
      });
      expect(participantsWithTeam).toHaveLength(0);
    });

    // ── test 3: non-host gets 403 ─────────────────────────────────────────────

    it('returns 403 when called by a non-host participant', async () => {
      const hostToken = await devLoginToken(request, 'perm_host_preview');
      const nonHostToken = await devLoginToken(request, 'perm_nonhost_preview');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      await joinAndConfirm('perm_nonhost_preview', matchId, 1000);

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${nonHostToken}`)
        .send({ teamCount: 2, seed: 1 });

      expect(res.status).toBe(403);
    });

    // ── test 4: cold-start fallback ───────────────────────────────────────────

    it('handles cold-start — participants without sport profiles get eloRating=1000', async () => {
      const hostToken = await devLoginToken(request, 'cold_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      // Join participants WITHOUT creating UserSportProfile
      for (let i = 0; i < 4; i++) {
        await joinAndConfirm(`cold_p${i}`, matchId);
      }

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 1 });

      expect(res.status).toBe(200);
      const data = res.body.data as {
        metrics: { coldStartCount: number };
        teams: Array<{ members: Array<{ eloRating: number; hasProfile: boolean }> }>;
      };

      // Host is auto-joined with confirmed status; total confirmed = 5 (host + 4 participants)
      // All 5 have no sport profiles → coldStartCount must equal exactly 5
      expect(data.metrics.coldStartCount).toBe(5);
      expect(data.teams[0].members.length + data.teams[1].members.length).toBe(5);

      // Verify all returned members have hasProfile=false and eloRating=1000
      const allMembers = data.teams.flatMap((t) => t.members);
      for (const member of allMembers) {
        expect(member.hasProfile).toBe(false);
        expect(member.eloRating).toBe(1000);
      }
    });

    // ── test 5: seed out of range → 400 ──────────────────────────────────────

    it('rejects seed=-1 with 400', async () => {
      const hostToken = await devLoginToken(request, 'seed_host_neg');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ seed: -1 });

      expect(res.status).toBe(400);
    });

    // ── test 6: invalid teamCount → 400 ──────────────────────────────────────

    it('rejects teamCount=5 with 400', async () => {
      const hostToken = await devLoginToken(request, 'tc_host_invalid');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 5 });

      expect(res.status).toBe(400);
    });
  });

  // ── test 7: generateTeams persists atomically ─────────────────────────────

  describe('POST /api/v1/matches/:id/teams', () => {
    it('creates Team records and assigns MatchParticipant.teamId atomically', async () => {
      const hostToken = await devLoginToken(request, 'gen_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      await joinAndConfirm('gen_p1', matchId, 1200);
      await joinAndConfirm('gen_p2', matchId, 1100);
      await joinAndConfirm('gen_p3', matchId, 1000);
      await joinAndConfirm('gen_p4', matchId, 900);

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 42 });

      expect([200, 201]).toContain(res.status);

      const data = res.body.data as {
        teams: Array<{ id: string }>;
        metrics: { maxEloGap: number };
        seed: number;
      };

      expect(data.teams).toHaveLength(2);
      expect(data.metrics).toHaveProperty('maxEloGap');
      expect(data.seed).toBe(42);

      // Verify DB state
      const dbTeamCount = await prisma.team.count({ where: { matchId } });
      expect(dbTeamCount).toBe(2);

      // All confirmed participants should have a teamId assigned
      const unassigned = await prisma.matchParticipant.findMany({
        where: { matchId, status: 'confirmed', teamId: null },
      });
      expect(unassigned).toHaveLength(0);
    });

    // ── test 8: re-call replaces teams (no orphans) ───────────────────────────

    it('replaces existing teams on second call (no orphan rows)', async () => {
      const hostToken = await devLoginToken(request, 'reroll_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      await joinAndConfirm('reroll_p1', matchId, 1300);
      await joinAndConfirm('reroll_p2', matchId, 1100);
      await joinAndConfirm('reroll_p3', matchId, 950);
      await joinAndConfirm('reroll_p4', matchId, 800);

      // First call with seed=1
      await request
        .post(`/api/v1/matches/${matchId}/teams`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 1 });

      const firstTeams = await prisma.team.findMany({ where: { matchId } });
      expect(firstTeams).toHaveLength(2);
      const firstTeamIds = new Set(firstTeams.map((t) => t.id));

      // Second call with seed=99 (re-roll)
      const secondRes = await request
        .post(`/api/v1/matches/${matchId}/teams`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 99 });

      expect([200, 201]).toContain(secondRes.status);

      // Only 2 teams should exist (no orphans from first call)
      const finalTeams = await prisma.team.findMany({ where: { matchId } });
      expect(finalTeams).toHaveLength(2);

      // Teams should be new (different IDs from first call)
      const finalTeamIds = new Set(finalTeams.map((t) => t.id));
      const overlap = [...finalTeamIds].filter((id) => firstTeamIds.has(id));
      expect(overlap).toHaveLength(0);

      // All participants must still have teamId assigned
      const unassigned = await prisma.matchParticipant.findMany({
        where: { matchId, status: 'confirmed', teamId: null },
      });
      expect(unassigned).toHaveLength(0);
    });

    // ── test 9: preview with seed=S matches generate with seed=S ─────────────

    it('preview and generate with same seed produce identical member groupings', async () => {
      const hostToken = await devLoginToken(request, 'seed_match_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      const userIds: string[] = [];
      const elos = [1300, 1200, 1100, 1000, 900, 800];
      for (let i = 0; i < elos.length; i++) {
        const uid = await joinAndConfirm(`seed_match_p${i}`, matchId, elos[i]);
        userIds.push(uid);
      }

      const SEED = 77;

      // Preview call
      const previewRes = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: SEED });
      expect(previewRes.status).toBe(200);

      const previewTeams = (previewRes.body.data as {
        teams: Array<{ members: Array<{ userId: string }> }>;
      }).teams;

      // Generate call with same seed
      const genRes = await request
        .post(`/api/v1/matches/${matchId}/teams`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: SEED });
      expect([200, 201]).toContain(genRes.status);

      const genTeams = (genRes.body.data as {
        teams: Array<{ members: Array<{ userId: string }> }>;
      }).teams;

      // Compare member userId sets for each team index
      for (let i = 0; i < 2; i++) {
        const previewUserIds = new Set(previewTeams[i].members.map((m) => m.userId));
        const genUserIds = new Set(genTeams[i].members.map((m) => m.userId));
        expect(previewUserIds).toEqual(genUserIds);
      }
    });

    // ── test 10: 409 when match is in completed status ─────────────────────────

    it('returns 409 when match is in completed status', async () => {
      const hostToken = await devLoginToken(request, 'completed_host_bal');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      // Force match to completed status
      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'completed' },
      });

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2 });

      expect(res.status).toBe(409);
    });
  });
});
