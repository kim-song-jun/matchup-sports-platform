import { BadRequestException } from '@nestjs/common';
import {
  TeamBalancingService,
  ParticipantWithElo,
} from './team-balancing.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal ParticipantWithElo with defaults for unused fields. */
function makeParticipant(
  overrides: Partial<ParticipantWithElo> & { userId: string; eloRating: number },
): ParticipantWithElo {
  return {
    participantId: `part-${overrides.userId}`,
    nickname: overrides.userId,
    profileImageUrl: null,
    hasProfile: true,
    ...overrides,
  };
}

/** Builds N participants with evenly-spaced ELOs between lo and hi (inclusive). */
function makeRange(
  n: number,
  lo: number,
  hi: number,
  hasProfile = true,
): ParticipantWithElo[] {
  const step = n > 1 ? (hi - lo) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) =>
    makeParticipant({
      userId: `u${String(i).padStart(3, '0')}`,
      eloRating: Math.round(lo + i * step),
      hasProfile,
    }),
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TeamBalancingService', () => {
  let svc: TeamBalancingService;

  beforeEach(() => {
    svc = new TeamBalancingService();
  });

  // 1. even distribution 8 participants, 2 teams
  it('balance_distributes_evenly_8p_2t', () => {
    // ELOs: 700, 800, 900, 1000, 1100, 1200, 1300, 1400
    const participants = makeRange(8, 700, 1400);
    const result = svc.balance(participants, 2, 42);

    expect(result.teams).toHaveLength(2);
    expect(result.teams[0].members).toHaveLength(4);
    expect(result.teams[1].members).toHaveLength(4);

    const gap = Math.abs(result.teams[0].avgElo - result.teams[1].avgElo);
    expect(gap).toBeLessThanOrEqual(50);
  });

  // 2. determinism — same seed produces identical results across 100 calls
  it('snake_order_deterministic', () => {
    const participants = makeRange(8, 700, 1400);
    const first = svc.balance(participants, 2, 1);
    const firstTeam0Ids = first.teams[0].members.map((m) => m.userId).sort();
    const firstTeam1Ids = first.teams[1].members.map((m) => m.userId).sort();

    for (let run = 0; run < 100; run++) {
      const result = svc.balance(participants, 2, 1);
      expect(result.teams[0].members.map((m) => m.userId).sort()).toEqual(
        firstTeam0Ids,
      );
      expect(result.teams[1].members.map((m) => m.userId).sort()).toEqual(
        firstTeam1Ids,
      );
    }
  });

  // 3. seed only affects equal-ELO ties
  it('seed_changes_affect_only_ties', () => {
    // Part A: all distinct ELOs → different seeds must produce identical assignments
    const distinctParticipants = makeRange(8, 700, 1400);
    const resultSeed1 = svc.balance(distinctParticipants, 2, 1);
    const resultSeed999 = svc.balance(distinctParticipants, 2, 999);

    const teamMembersById = (teams: typeof resultSeed1.teams) =>
      teams.map((t) => t.members.map((m) => m.userId).sort());

    expect(teamMembersById(resultSeed1.teams)).toEqual(
      teamMembersById(resultSeed999.teams),
    );

    // Part B: 4 pairs of equal ELO → different seeds may produce different within-pair ordering
    // Build: two members each at ELO 1400, 1200, 1000, 800
    const tiedParticipants: ParticipantWithElo[] = [
      makeParticipant({ userId: 'a1', eloRating: 1400 }),
      makeParticipant({ userId: 'a2', eloRating: 1400 }),
      makeParticipant({ userId: 'b1', eloRating: 1200 }),
      makeParticipant({ userId: 'b2', eloRating: 1200 }),
      makeParticipant({ userId: 'c1', eloRating: 1000 }),
      makeParticipant({ userId: 'c2', eloRating: 1000 }),
      makeParticipant({ userId: 'd1', eloRating: 800 }),
      makeParticipant({ userId: 'd2', eloRating: 800 }),
    ];

    // With equal-ELO pairs, check that results are consistent per seed
    const tiedSeed42a = svc.balance(tiedParticipants, 2, 42);
    const tiedSeed42b = svc.balance(tiedParticipants, 2, 42);
    expect(teamMembersById(tiedSeed42a.teams)).toEqual(
      teamMembersById(tiedSeed42b.teams),
    );
  });

  // 4. odd player count — 11 participants, 2 teams
  // Snake-draft natural distribution: picks i=0,3,4,7,8 → team A (5), picks i=1,2,5,6,9,10 → team B (6).
  // Top-ELO participant (pick i=0 after ELO-desc sort) lands in the smaller team — fairness invariant holds.
  it('odd_player_count_11p_2t', () => {
    // makeRange(11, 700, 1400): u000=700 (lowest) ... u010=1400 (highest)
    // ELO-desc sort: u010 is pick i=0 → team A (index 0)
    const participants = makeRange(11, 700, 1400);
    const result = svc.balance(participants, 2, 7);

    expect(result.teams).toHaveLength(2);
    // Snake-natural: team A gets 5 members, team B gets 6 members
    expect(result.teams[0].members.length).toBe(5);
    expect(result.teams[1].members.length).toBe(6);
    expect(result.teams[0].members.length + result.teams[1].members.length).toBe(11);

    // Fairness invariant: top-ELO participant is in the smaller (5-member) team
    expect(result.teams[0].members.some((m) => m.userId === 'u010')).toBe(true);
  });

  // 5. 3-team snake pattern with 9 participants
  it('multi_team_3t_9p_snake', () => {
    // Give distinct ELOs so PRNG has no effect on assignment order
    // ELOs sorted descending: u000=1400, u001=1312, ..., u008=700
    const participants = makeRange(9, 700, 1400);

    const result = svc.balance(participants, 3, 0);
    expect(result.teams).toHaveLength(3);

    // Snake order for 9p/3t:
    // row 0 (even): i=0→A, i=1→B, i=2→C
    // row 1 (odd):  i=3→C, i=4→B, i=5→A
    // row 2 (even): i=6→A, i=7→B, i=8→C
    // So: A={0,5,6}, B={1,4,7}, C={2,3,8}  (0-indexed sorted positions)
    expect(result.teams[0].members).toHaveLength(3); // A팀
    expect(result.teams[1].members).toHaveLength(3); // B팀
    expect(result.teams[2].members).toHaveLength(3); // C팀

    // Verify the snake pattern by pick positions
    // Sorted by ELO desc the participants are: u008(1400),u007(1312),...,u000(700)
    // (makeRange builds lo→hi, so u000=700, u008=1400; sorted desc → u008 first)
    const allSortedByEloDesc = [...participants].sort(
      (a, b) => b.eloRating - a.eloRating,
    );

    // pick positions 0..8 mapped to teams: A,B,C,C,B,A,A,B,C
    const expectedPattern = [0, 1, 2, 2, 1, 0, 0, 1, 2];
    for (let pickIdx = 0; pickIdx < 9; pickIdx++) {
      const expectedTeamIdx = expectedPattern[pickIdx];
      const participant = allSortedByEloDesc[pickIdx];
      expect(
        result.teams[expectedTeamIdx].members.some(
          (m) => m.userId === participant.userId,
        ),
      ).toBe(true);
    }
  });

  // 6. 4-team snake pattern with 8 participants — A-B-C-D-D-C-B-A
  it('multi_team_4t_snake_pattern', () => {
    // ELOs: [1400,1300,1200,1100,1000,900,800,700] (distinct, PRNG irrelevant)
    const participants: ParticipantWithElo[] = [
      makeParticipant({ userId: 'p1', eloRating: 1400 }),
      makeParticipant({ userId: 'p2', eloRating: 1300 }),
      makeParticipant({ userId: 'p3', eloRating: 1200 }),
      makeParticipant({ userId: 'p4', eloRating: 1100 }),
      makeParticipant({ userId: 'p5', eloRating: 1000 }),
      makeParticipant({ userId: 'p6', eloRating: 900 }),
      makeParticipant({ userId: 'p7', eloRating: 800 }),
      makeParticipant({ userId: 'p8', eloRating: 700 }),
    ];

    const result = svc.balance(participants, 4, 0);
    expect(result.teams).toHaveLength(4);

    // Snake row 0 (even): A=p1, B=p2, C=p3, D=p4
    // Snake row 1 (odd):  D=p5, C=p6, B=p7, A=p8
    // A팀 (idx 0): p1(1400), p8(700) → avgElo = round((1400+700)/2) = 1050
    // B팀 (idx 1): p2(1300), p7(800) → avgElo = round((1300+800)/2) = 1050
    // C팀 (idx 2): p3(1200), p6(900) → avgElo = round((1200+900)/2) = 1050
    // D팀 (idx 3): p4(1100), p5(1000) → avgElo = round((1100+1000)/2) = 1050

    const teamA = result.teams[0];
    const teamB = result.teams[1];
    const teamC = result.teams[2];
    const teamD = result.teams[3];

    // Each team has exactly 2 members
    expect(teamA.members).toHaveLength(2);
    expect(teamB.members).toHaveLength(2);
    expect(teamC.members).toHaveLength(2);
    expect(teamD.members).toHaveLength(2);

    // Verify A팀 has p1 and p8
    expect(teamA.members.map((m) => m.userId)).toContain('p1');
    expect(teamA.members.map((m) => m.userId)).toContain('p8');

    // Verify all teams have the same avgElo (perfectly balanced)
    expect(teamA.avgElo).toBe(1050);
    expect(teamB.avgElo).toBe(1050);
    expect(teamC.avgElo).toBe(1050);
    expect(teamD.avgElo).toBe(1050);

    // maxEloGap should be 0, variance should be 0
    expect(result.metrics.maxEloGap).toBe(0);
    expect(result.metrics.variance).toBe(0);
  });

  // 7. cold-start — all participants have hasProfile=false and eloRating=1000
  it('cold_start_all_1000', () => {
    const participants: ParticipantWithElo[] = Array.from(
      { length: 8 },
      (_, i) =>
        makeParticipant({
          userId: `cold${String(i).padStart(2, '0')}`,
          eloRating: 1000,
          hasProfile: false,
        }),
    );

    const result = svc.balance(participants, 2, 42);
    expect(result.metrics.coldStartCount).toBe(8);
    expect(result.teams[0].members.length + result.teams[1].members.length).toBe(8);

    // Same seed → deterministic result
    const result2 = svc.balance(participants, 2, 42);
    expect(result2.teams[0].members.map((m) => m.userId).sort()).toEqual(
      result.teams[0].members.map((m) => m.userId).sort(),
    );
  });

  // 8. cold-start mixed — 5 cold-start + 3 rated
  it('cold_start_mixed', () => {
    const ratedParticipants: ParticipantWithElo[] = [
      makeParticipant({ userId: 'r1', eloRating: 1300, hasProfile: true }),
      makeParticipant({ userId: 'r2', eloRating: 1100, hasProfile: true }),
      makeParticipant({ userId: 'r3', eloRating: 900, hasProfile: true }),
    ];
    const coldParticipants: ParticipantWithElo[] = Array.from(
      { length: 5 },
      (_, i) =>
        makeParticipant({
          userId: `c${i}`,
          eloRating: 1000,
          hasProfile: false,
        }),
    );

    const participants = [...ratedParticipants, ...coldParticipants];
    const result = svc.balance(participants, 2, 1);

    expect(result.metrics.coldStartCount).toBe(5);
    expect(
      result.teams[0].members.length + result.teams[1].members.length,
    ).toBe(8);
  });

  // 9. throws BadRequestException for empty participants
  it('throws_on_no_participants', () => {
    expect(() => svc.balance([], 2, 0)).toThrow(BadRequestException);
    expect(() => svc.balance([], 2, 0)).toThrow('NO_PARTICIPANTS');
  });

  // 10. throws BadRequestException for teamCount=1
  it('throws_on_team_count_too_low', () => {
    const participants = makeRange(4, 900, 1200);
    expect(() => svc.balance(participants, 1, 0)).toThrow(BadRequestException);
    expect(() => svc.balance(participants, 1, 0)).toThrow('TEAM_COUNT_INVALID');
  });

  // 10b. throws BadRequestException for teamCount=5
  it('throws_on_team_count_too_high', () => {
    const participants = makeRange(8, 800, 1400);
    expect(() => svc.balance(participants, 5, 0)).toThrow(BadRequestException);
    expect(() => svc.balance(participants, 5, 0)).toThrow('TEAM_COUNT_INVALID');
  });

  // 11. throws BadRequestException when teamCount exceeds participants
  it('throws_on_team_count_exceeds_participants', () => {
    const participants = [
      makeParticipant({ userId: 'u1', eloRating: 1000 }),
      makeParticipant({ userId: 'u2', eloRating: 1100 }),
    ];
    expect(() => svc.balance(participants, 3, 0)).toThrow(BadRequestException);
    expect(() => svc.balance(participants, 3, 0)).toThrow(
      'TEAM_COUNT_EXCEEDS_PARTICIPANTS',
    );
  });

  // 12. metrics are computed correctly for a known balanced distribution
  it('metrics_correct_for_balanced_distribution', () => {
    // 4 participants, 2 teams, distinct ELOs → perfectly balanced
    // ELOs: 1400, 1200, 1000, 800 (snake: A=1400+800, B=1200+1000)
    const participants: ParticipantWithElo[] = [
      makeParticipant({ userId: 'x1', eloRating: 1400 }),
      makeParticipant({ userId: 'x2', eloRating: 1200 }),
      makeParticipant({ userId: 'x3', eloRating: 1000 }),
      makeParticipant({ userId: 'x4', eloRating: 800 }),
    ];

    const result = svc.balance(participants, 2, 0);
    expect(result.teams).toHaveLength(2);

    // A팀: avgElo = round((1400 + 800) / 2) = 1100
    // B팀: avgElo = round((1200 + 1000) / 2) = 1100
    expect(result.metrics.teamAvgElos).toEqual([1100, 1100]);
    expect(result.metrics.maxEloGap).toBe(0);
    expect(result.metrics.variance).toBe(0);
    expect(result.metrics.stdDev).toBe(0);
    expect(result.metrics.coldStartCount).toBe(0);

    // Seed should be echoed back
    expect(result.seed).toBe(0);
  });

  // 12b. metrics for unbalanced known distribution
  it('metrics_correct_for_unbalanced_distribution', () => {
    // 4 participants, 2 teams, deliberately unbalanced ELOs
    // ELOs: 1600, 1500, 1000, 900 (snake: A=1600+900, B=1500+1000)
    const participants: ParticipantWithElo[] = [
      makeParticipant({ userId: 'y1', eloRating: 1600 }),
      makeParticipant({ userId: 'y2', eloRating: 1500 }),
      makeParticipant({ userId: 'y3', eloRating: 1000 }),
      makeParticipant({ userId: 'y4', eloRating: 900 }),
    ];

    const result = svc.balance(participants, 2, 0);

    // A팀: round((1600 + 900) / 2) = round(1250) = 1250
    // B팀: round((1500 + 1000) / 2) = round(1250) = 1250
    expect(result.metrics.teamAvgElos).toEqual([1250, 1250]);
    expect(result.metrics.maxEloGap).toBe(0);
    expect(result.metrics.variance).toBe(0);
    expect(result.metrics.stdDev).toBe(0);
  });

  // 12c. metrics for genuinely unbalanced: 3 participants, 2 teams
  it('metrics_correct_for_3p_2t', () => {
    // ELOs: 1400, 1200, 800 — distinct → PRNG not used
    // Snake picks for n=3, k=2:
    //   i=0: row=0(even), col=0 → team A = z1(1400)
    //   i=1: row=0(even), col=1 → team B = z2(1200)
    //   i=2: row=1(odd),  col=0 → teamIndex = k-1-0 = 1 → team B = z3(800)
    // A=[1400]     avgElo = 1400
    // B=[1200,800] avgElo = round(1000) = 1000
    const participants: ParticipantWithElo[] = [
      makeParticipant({ userId: 'z1', eloRating: 1400 }),
      makeParticipant({ userId: 'z2', eloRating: 1200 }),
      makeParticipant({ userId: 'z3', eloRating: 800 }),
    ];

    const result = svc.balance(participants, 2, 0);
    expect(result.metrics.teamAvgElos).toEqual([1400, 1000]);
    expect(result.metrics.maxEloGap).toBe(400);

    // mean = (1400 + 1000) / 2 = 1200
    // variance = ((1400-1200)^2 + (1000-1200)^2) / 2 = (40000 + 40000) / 2 = 40000
    expect(result.metrics.variance).toBe(40000);
    expect(result.metrics.stdDev).toBeCloseTo(200, 1);
  });

  // team names and colors are correctly assigned
  it('team_names_and_colors_are_correct', () => {
    const participants = makeRange(8, 700, 1400);
    const result = svc.balance(participants, 4, 0);

    expect(result.teams[0].name).toBe('A팀');
    expect(result.teams[1].name).toBe('B팀');
    expect(result.teams[2].name).toBe('C팀');
    expect(result.teams[3].name).toBe('D팀');

    expect(result.teams[0].color).toBe('#2563EB');
    expect(result.teams[1].color).toBe('#4F46E5');
    expect(result.teams[2].color).toBe('#0369A1');
    expect(result.teams[3].color).toBe('#334155');
  });

  // seed is echoed back in the response
  it('seed_is_echoed_in_response', () => {
    const participants = makeRange(4, 900, 1100);
    const result = svc.balance(participants, 2, 12345);
    expect(result.seed).toBe(12345);
  });

  // auto-generated seed is a positive integer
  it('auto_generated_seed_is_positive_integer', () => {
    const participants = makeRange(4, 900, 1100);
    const result = svc.balance(participants, 2);
    expect(typeof result.seed).toBe('number');
    expect(Number.isInteger(result.seed)).toBe(true);
    expect(result.seed).toBeGreaterThanOrEqual(0);
    expect(result.seed).toBeLessThan(0x7fffffff);
  });
});
