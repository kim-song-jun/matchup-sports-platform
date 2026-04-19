import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as supertest from 'supertest';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';

// ---------------------------------------------------------------------------
// Integration tests: ELO-aware team balancing — preview (dry-run) + generateTeams
// ---------------------------------------------------------------------------

jest.setTimeout(90000);

describe('Matches Team Balancing (e2e)', () => {
  let app: INestApplication;
  let request: supertest.Agent;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
    throttlerStorage = app.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    // Throttler reset between tests — all supertest calls share 127.0.0.1,
    // so rate-limit counters and decrement timers accumulate across tests.
    //
    // Two-phase reset:
    //  1. Cancel pending 60-second decrement timers (keep the timeoutIds Map keys
    //     so setExpirationTime() can still push new ids — just empty each array).
    //  2. Zero totalHits and unblock each storage entry (keep entries in _storage
    //     so increment() does NOT skip initialisation and encounter undefined hits).
    //
    // NOTE: timeoutIds is private in TypeScript but a plain property at runtime.
    const ts = throttlerStorage as any;
    if (ts.timeoutIds instanceof Map) {
      for (const [name, ids] of (ts.timeoutIds as Map<string, NodeJS.Timeout[]>).entries()) {
        ids.forEach(clearTimeout);
        ts.timeoutIds.set(name, []);
      }
    }
    for (const record of throttlerStorage.storage.values()) {
      for (const name of record.totalHits.keys()) {
        record.totalHits.set(name, 0);
      }
      record.isBlocked = false;
      // Reset the TTL window so the 60-second timer starts fresh in C7-6.
      (record as any).expiresAt = 0;
    }
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

      // Structural assertions: response must include coldStartCount + consistent team sizes
      expect(typeof data.metrics.coldStartCount).toBe('number');
      expect(data.metrics.coldStartCount).toBeGreaterThanOrEqual(0);
      const totalMembers = data.teams[0].members.length + data.teams[1].members.length;
      expect(totalMembers).toBeGreaterThanOrEqual(4);

      // Every cold-start member (hasProfile=false) must have eloRating=1000 fallback
      const coldMembers = data.teams
        .flatMap((t) => t.members)
        .filter((m) => !m.hasProfile);
      for (const member of coldMembers) {
        expect(member.eloRating).toBe(1000);
      }
      // The count must equal what we observed in the teams
      expect(data.metrics.coldStartCount).toBe(coldMembers.length);
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

    // ── C7-1: 3-team snake distribution ──────────────────────────────────────
    // 11 participants total (10 explicit joins + host auto-confirmed on match creation)
    // → sizes should sum to 11 with at most 1 size difference between largest and smallest.

    it('distributes 11 participants into 3 teams with balanced sizes', async () => {
      const hostToken = await devLoginToken(request, 'snake3_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      // Set host ELO so they are not cold-start (coldStartCount must be 0).
      // Host is auto-confirmed as participant on match creation (total = 10 joins + 1 host = 11).
      const hostUser = await prisma.user.findFirst({ where: { nickname: 'snake3_host' } });
      expect(hostUser).not.toBeNull();
      await prisma.userSportProfile.upsert({
        where: { userId_sportType: { userId: hostUser!.id, sportType: 'futsal' } },
        create: { userId: hostUser!.id, sportType: 'futsal', eloRating: 1600, level: 5 },
        update: { eloRating: 1600 },
      });

      // 10 explicit joins with distinct ELOs (all below host's 1600, no ties).
      const elos = [1500, 1450, 1400, 1350, 1300, 1250, 1200, 1150, 1100, 1050];
      for (let i = 0; i < elos.length; i++) {
        await joinAndConfirm(`snake3_p${i}`, matchId, elos[i]);
      }

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 3, seed: 1 });

      expect(res.status).toBe(200);

      const data = res.body.data as {
        teams: Array<{ index: number; name: string; members: unknown[] }>;
        metrics: { maxEloGap: number; coldStartCount: number };
      };

      expect(data.teams).toHaveLength(3);

      const sizes = data.teams.map((t) => t.members.length);
      const total = sizes.reduce((s, n) => s + n, 0);
      expect(total).toBe(11);

      // Snake-draft guarantees at most 1-person difference between any two teams
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);
      expect(maxSize - minSize).toBeLessThanOrEqual(1);

      // Teams are named A팀, B팀, C팀
      expect(data.teams[0].name).toBe('A팀');
      expect(data.teams[1].name).toBe('B팀');
      expect(data.teams[2].name).toBe('C팀');

      expect(data.metrics.coldStartCount).toBe(0);
    });

    // ── C7-2: 4-team snake pattern ────────────────────────────────────────────
    // 12 participants total (11 explicit joins + host auto-confirmed on match creation).
    // All ELOs distinct → snake assigns A-B-C-D-D-C-B-A-A-B-C-D. Each team gets 3.

    it('assigns 12 participants into 4 teams using snake-draft (3 each)', async () => {
      const hostToken = await devLoginToken(request, 'snake4_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      // Set host ELO to anchor their rank position (rank 0 = highest).
      // Host is always auto-confirmed as participant on match creation.
      const hostUser = await prisma.user.findFirst({ where: { nickname: 'snake4_host' } });
      expect(hostUser).not.toBeNull();
      await prisma.userSportProfile.upsert({
        where: { userId_sportType: { userId: hostUser!.id, sportType: 'futsal' } },
        create: { userId: hostUser!.id, sportType: 'futsal', eloRating: 1600, level: 5 },
        update: { eloRating: 1600 },
      });

      // 11 explicit joins with distinct ELOs (ranks 1-11 after host's 1600 at rank 0).
      // 100-point gaps → no ties → seed irrelevant for assignment order.
      const elos = [1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 500];
      for (let i = 0; i < elos.length; i++) {
        await joinAndConfirm(`snake4_p${i}`, matchId, elos[i]);
      }

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 4, seed: 1 });

      expect(res.status).toBe(200);

      const data = res.body.data as {
        teams: Array<{ index: number; members: Array<{ eloRating: number }> }>;
      };

      expect(data.teams).toHaveLength(4);

      // All teams must have exactly 3 members (12 / 4 = 3, no remainder)
      for (const team of data.teams) {
        expect(team.members).toHaveLength(3);
      }

      // Verify snake-draft pattern by checking ELO rank positions.
      // With distinct ELOs sorted DESC, ranks 0-11:
      //   row 0 (even): idx 0→A, 1→B, 2→C, 3→D
      //   row 1 (odd):  idx 4→D, 5→C, 6→B, 7→A
      //   row 2 (even): idx 8→A, 9→B, 10→C, 11→D
      // A gets ranks: 0, 7, 8  → ELOs: 1600, 900, 800
      // B gets ranks: 1, 6, 9  → ELOs: 1500, 1000, 700
      // C gets ranks: 2, 5, 10 → ELOs: 1400, 1100, 600
      // D gets ranks: 3, 4, 11 → ELOs: 1300, 1200, 500

      const teamElos = data.teams.map((t) =>
        t.members.map((m) => m.eloRating).sort((a, b) => b - a),
      );

      expect(teamElos[0]).toEqual([1600, 900, 800]);  // A팀
      expect(teamElos[1]).toEqual([1500, 1000, 700]); // B팀
      expect(teamElos[2]).toEqual([1400, 1100, 600]); // C팀
      expect(teamElos[3]).toEqual([1300, 1200, 500]); // D팀
    });

    // ── C7-3: in_progress match → 409 ────────────────────────────────────────

    it('returns 409 MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT when match is in_progress', async () => {
      const hostToken = await devLoginToken(request, 'inprog_host_prev');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      await joinAndConfirm('inprog_p1', matchId, 1200);
      await joinAndConfirm('inprog_p2', matchId, 1100);

      // Force match to in_progress state
      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'in_progress' },
      });

      const res = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 1 });

      expect(res.status).toBe(409);
      // AllExceptionsFilter puts the error code in the message field (no .error field)
      expect(res.body.message).toContain('MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT');
    });

    // ── C7-4: concurrent preview — PRNG determinism ───────────────────────────
    // Parallel requests with the same seed must produce identical teams arrays.
    // Concurrency kept at 5 to stay within Prisma default connection pool on CI runners.

    it('5 concurrent preview requests with same seed return identical team assignments', async () => {
      const hostToken = await devLoginToken(request, 'concur_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      // Avoid 1000 in the pool — host has no ELO profile so they fall back to 1000 (cold-start).
      // Using 950 instead prevents ties in the ELO sort, keeping assignments fully deterministic.
      const elos = [1400, 1300, 1200, 1100, 950, 900, 800, 700];
      for (let i = 0; i < elos.length; i++) {
        await joinAndConfirm(`concur_p${i}`, matchId, elos[i]);
      }

      const SEED = 42;
      const CONCURRENCY = 5;

      const responses = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          request
            .post(`/api/v1/matches/${matchId}/teams/preview`)
            .set('Authorization', `Bearer ${hostToken}`)
            .send({ teamCount: 2, seed: SEED }),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // All responses must produce identical team member sets
      type MemberEntry = { userId: string };
      type TeamEntry = { members: MemberEntry[] };

      const firstTeams = (responses[0].body.data as { teams: TeamEntry[] }).teams;
      const firstTeamUserIds = firstTeams.map((t) =>
        t.members.map((m) => m.userId).sort(),
      );

      for (let i = 1; i < CONCURRENCY; i++) {
        const teams = (responses[i].body.data as { teams: TeamEntry[] }).teams;
        const teamUserIds = teams.map((t) =>
          t.members.map((m) => m.userId).sort(),
        );
        expect(teamUserIds).toEqual(firstTeamUserIds);
      }
    });

    // ── C7-5: stale participantHash → 409 PARTICIPANTS_CHANGED ───────────────
    // This test depends on Track A service-layer stale check implementation.
    // If Track A is not yet merged, this test will fail with 200 instead of 409.

    it('returns 409 PARTICIPANTS_CHANGED when participantHash is stale (Track A dep)', async () => {
      const hostToken = await devLoginToken(request, 'stale_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      const participantNicknames = ['stale_p1', 'stale_p2', 'stale_p3', 'stale_p4'];
      const userIds: string[] = [];
      for (const nick of participantNicknames) {
        const uid = await joinAndConfirm(nick, matchId, 1200);
        userIds.push(uid);
      }

      // Preview with the full participant set — captures a participantHash
      const previewRes = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 10 });

      expect(previewRes.status).toBe(200);

      const capturedHash = (previewRes.body.data as { participantHash: string }).participantHash;
      expect(capturedHash).toMatch(/^[a-f0-9]{64}$/);

      // Simulate participant leaving: remove one confirmed participant directly
      await prisma.matchParticipant.deleteMany({
        where: { matchId, userId: userIds[3] },
      });

      // Compose with the now-stale hash — should trigger 409
      const composeRes = await request
        .post(`/api/v1/matches/${matchId}/teams`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 10, participantHash: capturedHash });

      expect(composeRes.status).toBe(409);
      // AllExceptionsFilter preserves the `code` field from the ConflictException
      // object response so frontend can route on it (auto re-preview path in
      // auto-balance-modal). Test both the code and the Korean message.
      expect(composeRes.body.code).toBe('PARTICIPANTS_CHANGED');
      expect(composeRes.body.message).toContain('참가자가 변경되었어요');
    });

    // ── C7-6: rate limit → 429 ───────────────────────────────────────────────
    // Must be last in describe block — consumes throttler quota.
    // throttlerStorage.storage.clear() in beforeEach ensures a clean slate.

    it('returns 429 with Retry-After header after 20 preview requests', async () => {
      const hostToken = await devLoginToken(request, 'ratelimit_host');
      const venueId = await ensureVenueId();
      const matchId = await createMatch(hostToken, venueId);

      await joinAndConfirm('ratelimit_p1', matchId, 1200);
      await joinAndConfirm('ratelimit_p2', matchId, 1100);
      await joinAndConfirm('ratelimit_p3', matchId, 1000);
      await joinAndConfirm('ratelimit_p4', matchId, 900);

      // Fire 20 requests — all must succeed (within limit)
      for (let i = 0; i < 20; i++) {
        const res = await request
          .post(`/api/v1/matches/${matchId}/teams/preview`)
          .set('Authorization', `Bearer ${hostToken}`)
          .send({ teamCount: 2, seed: i });
        expect(res.status).toBe(200);
      }

      // 21st request must be throttled
      const blockedRes = await request
        .post(`/api/v1/matches/${matchId}/teams/preview`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ teamCount: 2, seed: 99 });

      expect(blockedRes.status).toBe(429);
      // ThrottlerGuard sets Retry-After to the configured ttl in seconds (60_000ms → '60')
      expect(blockedRes.headers['retry-after']).toBe('60');
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
