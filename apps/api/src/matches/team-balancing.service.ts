import { Injectable, BadRequestException } from '@nestjs/common';

export interface ParticipantWithElo {
  participantId: string; // MatchParticipant.id
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  eloRating: number; // 1000 if no UserSportProfile for the match's sportType
  hasProfile: boolean; // false = cold-start (treated as 1000)
}

export interface TeamAssignment {
  index: number; // 0-based team index
  name: string; // 'A팀' | 'B팀' | 'C팀' | 'D팀'
  color: string; // hex color
  members: ParticipantWithElo[];
  avgElo: number;
}

export interface BalanceMetrics {
  maxEloGap: number; // max(teamAvgElo) - min(teamAvgElo)
  variance: number; // population variance of teamAvgElo
  stdDev: number; // sqrt(variance)
  teamAvgElos: number[]; // [teamA, teamB, ...]
  coldStartCount: number; // number of participants with hasProfile=false
}

export interface BalancedDistribution {
  teams: TeamAssignment[];
  metrics: BalanceMetrics;
  seed: number; // echo back (server-generated if caller omitted)
}

/** Team names and colors for indices 0..3 */
const TEAM_NAMES = ['A팀', 'B팀', 'C팀', 'D팀'];
const TEAM_COLORS = ['#2563EB', '#4F46E5', '#0369A1', '#334155'];

@Injectable()
export class TeamBalancingService {
  /**
   * Distributes participants into balanced teams using a greedy snake-draft
   * over the ELO-sorted participant list.
   */
  balance(
    participants: ParticipantWithElo[],
    teamCount: number,
    seed?: number,
  ): BalancedDistribution {
    if (participants.length === 0) {
      throw new BadRequestException('NO_PARTICIPANTS');
    }
    if (teamCount < 2 || teamCount > 4) {
      throw new BadRequestException('TEAM_COUNT_INVALID');
    }
    if (teamCount > participants.length) {
      throw new BadRequestException('TEAM_COUNT_EXCEEDS_PARTICIPANTS');
    }

    // Resolve seed
    const resolvedSeed =
      seed !== undefined
        ? seed
        : Math.floor(Math.random() * 0x7fffffff);

    // Initialize PRNG
    const rand = this.mulberry32(resolvedSeed);

    // Sort by (eloRating DESC, userId ASC) — deterministic tie-break
    const sorted = [...participants].sort((a, b) => {
      if (b.eloRating !== a.eloRating) return b.eloRating - a.eloRating;
      return a.userId.localeCompare(b.userId);
    });

    // Group equal-ELO runs, shuffle each group with PRNG
    const shuffled = this.shuffleEloGroups(sorted, rand);

    // Initialize team buckets
    const teamBuckets: ParticipantWithElo[][] = Array.from(
      { length: teamCount },
      () => [],
    );

    // Snake-draft assignment
    for (let i = 0; i < shuffled.length; i++) {
      const row = Math.floor(i / teamCount);
      const col = i % teamCount;
      const teamIndex = row % 2 === 0 ? col : teamCount - 1 - col;
      teamBuckets[teamIndex].push(shuffled[i]);
    }

    // Build TeamAssignment rows
    const teams: TeamAssignment[] = teamBuckets.map((members, idx) => {
      const avgElo =
        members.length > 0
          ? Math.round(
              members.reduce((sum, p) => sum + p.eloRating, 0) / members.length,
            )
          : 0;
      return {
        index: idx,
        name: TEAM_NAMES[idx],
        color: TEAM_COLORS[idx],
        members,
        avgElo,
      };
    });

    // Compute metrics
    const metrics = this.computeMetrics(teams, participants);

    return { teams, metrics, seed: resolvedSeed };
  }

  /**
   * Computes balance metrics from built team assignments.
   * Uses population variance (divide by n, not n-1).
   */
  private computeMetrics(
    teams: TeamAssignment[],
    participants: ParticipantWithElo[],
  ): BalanceMetrics {
    const teamAvgElos = teams.map((t) => t.avgElo);
    const maxEloGap =
      Math.max(...teamAvgElos) - Math.min(...teamAvgElos);

    const mean =
      teamAvgElos.reduce((sum, e) => sum + e, 0) / teamAvgElos.length;
    const variance =
      teamAvgElos.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) /
      teamAvgElos.length;
    const stdDev = Math.sqrt(variance);

    const coldStartCount = participants.filter((p) => !p.hasProfile).length;

    return { maxEloGap, variance, stdDev, teamAvgElos, coldStartCount };
  }

  /**
   * Groups participants by equal eloRating, then uses PRNG to shuffle
   * within each group (only called when group.length > 1 to avoid
   * consuming PRNG state for singletons).
   */
  private shuffleEloGroups(
    sorted: ParticipantWithElo[],
    rand: () => number,
  ): ParticipantWithElo[] {
    const result: ParticipantWithElo[] = [];
    let i = 0;
    while (i < sorted.length) {
      // Collect contiguous run with the same ELO
      let j = i + 1;
      while (j < sorted.length && sorted[j].eloRating === sorted[i].eloRating) {
        j++;
      }
      const group = sorted.slice(i, j);
      // Only shuffle groups with more than one member
      if (group.length > 1) {
        this.fisherYatesShuffle(group, rand);
      }
      result.push(...group);
      i = j;
    }
    return result;
  }

  /**
   * In-place Fisher-Yates shuffle using the provided PRNG.
   */
  private fisherYatesShuffle<T>(arr: T[], rand: () => number): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /**
   * mulberry32 PRNG — fast, seedable, deterministic 32-bit generator.
   * Returns a function that yields floats in [0, 1).
   */
  private mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
  }
}
