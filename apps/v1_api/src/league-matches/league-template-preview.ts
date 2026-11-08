import type { LeagueTemplatePlan, LeagueTemplateSlot } from './league-template-plan';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface LeagueTemplatePreviewGame {
  round: number;
  /** 1-based position of the game inside its day. */
  order: number;
  startTime: string;
  endTime: string | null;
  homePosition: number;
  awayPosition: number;
  /** Seats of this game that also played the game right before it (same day, no game in between). */
  backToBack: Array<{ position: number; games: number }>;
}

export interface LeagueTemplatePreviewDay {
  day: number;
  startTime: string;
  endTime: string | null;
  games: LeagueTemplatePreviewGame[];
}

export interface LeagueTemplatePreview {
  teamCount: number;
  legs: 1 | 2;
  totalRounds: number;
  fixtureCount: number;
  gamesPerDay: number | null;
  days: LeagueTemplatePreviewDay[];
  checks: {
    /** Pair meetings beyond `legs`, summed over pairs. */
    duplicateMeetings: number;
    /** Pair meetings short of `legs`, summed over pairs. */
    missingMeetings: number;
    /** One entry per maximal run of one seat playing 2+ consecutive games of a day. */
    backToBackRuns: Array<{ day: number; position: number; fromOrder: number; toOrder: number; games: number }>;
  };
}

/** `HH:mm` on the KST wall clock — the zone every league schedule is entered in. */
export function kstTimeOf(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * Dry run of a template: the per-day timetable plus the checks an operator cannot do by eye.
 * `slots` come from `resolveTemplateSlots`, i.e. the same values creation writes.
 *
 * Back-to-back is only meaningful when games of a day run in sequence (`gamesPerDay` set); a round that
 * starts all at once has no "right after".
 */
export function buildLeagueTemplatePreview(
  input: { teamCount: number; legs: 1 | 2; gamesPerDay: number | null },
  plan: LeagueTemplatePlan,
  slots: readonly LeagueTemplateSlot[],
): LeagueTemplatePreview {
  const meetings = new Map<string, number>();
  const days: LeagueTemplatePreviewDay[] = [];
  const backToBackRuns: LeagueTemplatePreview['checks']['backToBackRuns'] = [];
  const sequential = input.gamesPerDay !== null;
  // Streak of each seat in the game just before the current one, same day only.
  let previous = new Map<number, { games: number; fromOrder: number }>();

  const flush = (day: number, lastOrder: number, keep: ReadonlySet<number>) => {
    for (const [position, streak] of previous) {
      if (keep.has(position) || streak.games < 2) continue;
      backToBackRuns.push({ day, position, fromOrder: streak.fromOrder, toOrder: lastOrder, games: streak.games });
    }
  };

  plan.fixtures.forEach((fixture, index) => {
    const slot = slots[index];
    const key = `${Math.min(fixture.homePosition, fixture.awayPosition)}-${Math.max(fixture.homePosition, fixture.awayPosition)}`;
    meetings.set(key, (meetings.get(key) ?? 0) + 1);

    let day = days[days.length - 1];
    if (day === undefined || day.day !== slot.matchday) {
      if (day !== undefined) flush(day.day, day.games.length, new Set());
      previous = new Map();
      day = { day: slot.matchday, startTime: kstTimeOf(slot.startAt), endTime: null, games: [] };
      days.push(day);
    }

    const seats = [fixture.homePosition, fixture.awayPosition];
    const backToBack: LeagueTemplatePreviewGame['backToBack'] = [];
    if (sequential) {
      flush(slot.matchday, slot.orderInDay - 1, new Set(seats));
      const current = new Map<number, { games: number; fromOrder: number }>();
      for (const position of seats) {
        const before = previous.get(position);
        const streak = before === undefined ? { games: 1, fromOrder: slot.orderInDay } : { games: before.games + 1, fromOrder: before.fromOrder };
        current.set(position, streak);
        if (streak.games >= 2) backToBack.push({ position, games: streak.games });
      }
      previous = current;
    }

    day.games.push({
      round: fixture.round,
      order: slot.orderInDay,
      startTime: kstTimeOf(slot.startAt),
      endTime: slot.endAt === null ? null : kstTimeOf(slot.endAt),
      homePosition: fixture.homePosition,
      awayPosition: fixture.awayPosition,
      backToBack,
    });
    day.endTime = slot.endAt === null ? null : kstTimeOf(slot.endAt);
  });
  const lastDay = days[days.length - 1];
  if (lastDay !== undefined) flush(lastDay.day, lastDay.games.length, new Set());

  let duplicateMeetings = 0;
  let missingMeetings = 0;
  for (let home = 1; home <= input.teamCount; home += 1) {
    for (let away = home + 1; away <= input.teamCount; away += 1) {
      const count = meetings.get(`${home}-${away}`) ?? 0;
      duplicateMeetings += Math.max(0, count - input.legs);
      missingMeetings += Math.max(0, input.legs - count);
    }
  }

  return {
    teamCount: input.teamCount,
    legs: input.legs,
    totalRounds: plan.totalRounds,
    fixtureCount: plan.fixtures.length,
    gamesPerDay: input.gamesPerDay,
    days,
    checks: { duplicateMeetings, missingMeetings, backToBackRuns },
  };
}
