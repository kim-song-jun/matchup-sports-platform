import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PreviewLeagueTemplateDto } from './dto/league-match.dto';
import { planLeagueTemplate, resolveTemplateSlots, templateMatchdayCount } from './league-template-plan';
import { buildLeagueTemplatePreview, kstTimeOf } from './league-template-preview';

/** Day starts at `time` KST on consecutive far-future dates. */
const dayStarts = (count: number, time = '19:00') =>
  Array.from({ length: count }, (_, index) => new Date(`2030-03-${String(index + 1).padStart(2, '0')}T${time}:00+09:00`));

const previewOf = (teamCount: number, legs: 1 | 2, timing: { gamesPerDay: number; gameDurationMinutes: number; breakMinutes: number } | null) => {
  const plan = planLeagueTemplate({ teamCount, legs });
  const slots = resolveTemplateSlots(plan, dayStarts(templateMatchdayCount(plan, timing?.gamesPerDay)), timing);
  return { plan, slots, preview: buildLeagueTemplatePreview({ teamCount, legs, gamesPerDay: timing?.gamesPerDay ?? null }, plan, slots) };
};

describe('buildLeagueTemplatePreview', () => {
  it('lists the sequential timetable day by day with the same start/end the slots carry', () => {
    const { plan, slots, preview } = previewOf(4, 1, { gamesPerDay: 4, gameDurationMinutes: 20, breakMinutes: 5 });

    expect(preview.days.map((day) => [day.day, day.startTime, day.endTime, day.games.length])).toEqual([
      [1, '19:00', '20:35', 4],
      [2, '19:00', '19:45', 2],
    ]);
    const flat = preview.days.flatMap((day) => day.games);
    expect(flat.map((game) => [game.startTime, game.endTime])).toEqual(slots.map((slot) => [kstTimeOf(slot.startAt), kstTimeOf(slot.endAt!)]));
    expect(flat.map((game) => [game.homePosition, game.awayPosition])).toEqual(
      plan.fixtures.map((fixture) => [fixture.homePosition, fixture.awayPosition]),
    );
  });

  it.each([
    { teamCount: 3, legs: 1 as const },
    { teamCount: 4, legs: 2 as const },
    { teamCount: 5, legs: 1 as const },
    { teamCount: 8, legs: 2 as const },
  ])('$teamCount teams x $legs legs: every pair meets exactly legs times', ({ teamCount, legs }) => {
    expect(previewOf(teamCount, legs, { gamesPerDay: 3, gameDurationMinutes: 20, breakMinutes: 0 }).preview.checks).toMatchObject({
      duplicateMeetings: 0,
      missingMeetings: 0,
    });
  });

  it('counts a pair met too often and a pair never met, so the check can fail', () => {
    const { plan, slots } = previewOf(4, 1, { gamesPerDay: 3, gameDurationMinutes: 20, breakMinutes: 0 });
    const broken = { ...plan, fixtures: plan.fixtures.map((fixture, index) => (index === 0 ? { ...plan.fixtures[1] } : fixture)) };

    const { checks } = buildLeagueTemplatePreview({ teamCount: 4, legs: 1, gamesPerDay: 3 }, broken, slots);

    expect(checks.duplicateMeetings).toBe(1);
    expect(checks.missingMeetings).toBe(1);
  });

  it('flags a seat that plays consecutive games of a day once per run, and marks the later games', () => {
    // 4 teams: two adjacent games of different rounds cannot be disjoint pairs again, so a seat repeats.
    const { preview } = previewOf(4, 1, { gamesPerDay: 3, gameDurationMinutes: 25, breakMinutes: 5 });

    const runs = preview.checks.backToBackRuns;
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      const games = preview.days[run.day - 1].games.slice(run.fromOrder - 1, run.toOrder);
      expect(games).toHaveLength(run.games);
      expect(games.every((game) => game.homePosition === run.position || game.awayPosition === run.position)).toBe(true);
      expect(run.games).toBeGreaterThanOrEqual(2);
    }
    const marked = preview.days.flatMap((day) => day.games).flatMap((game) => game.backToBack);
    expect(marked.length).toBeGreaterThanOrEqual(runs.length);
    expect(marked.every((entry) => entry.games >= 2)).toBe(true);
  });

  it('does not carry a run across a day boundary', () => {
    // 4 teams, 1 game a day: nobody ever plays twice in a row.
    const { preview } = previewOf(4, 1, { gamesPerDay: 1, gameDurationMinutes: 20, breakMinutes: 0 });
    expect(preview.days).toHaveLength(6);
    expect(preview.checks.backToBackRuns).toEqual([]);
  });

  it('without a daily game count a round is one day, all games start together and have no end', () => {
    const { preview } = previewOf(4, 1, null);

    expect(preview.days.map((day) => day.games.map((game) => [game.startTime, game.endTime]))).toEqual([
      [['19:00', null], ['19:00', null]],
      [['19:00', null], ['19:00', null]],
      [['19:00', null], ['19:00', null]],
    ]);
    expect(preview.checks.backToBackRuns).toEqual([]);
  });

  it('wraps a late start past midnight on the KST clock', () => {
    const plan = planLeagueTemplate({ teamCount: 3, legs: 1 });
    const timing = { gamesPerDay: 3, gameDurationMinutes: 30, breakMinutes: 0 };
    const preview = buildLeagueTemplatePreview(
      { teamCount: 3, legs: 1, gamesPerDay: 3 },
      plan,
      resolveTemplateSlots(plan, dayStarts(1, '23:00'), timing),
    );
    expect(preview.days[0].games.map((game) => [game.startTime, game.endTime])).toEqual([
      ['23:00', '23:30'], ['23:30', '00:00'], ['00:00', '00:30'],
    ]);
  });
});

describe('PreviewLeagueTemplateDto', () => {
  const check = (body: object) => validate(plainToInstance(PreviewLeagueTemplateDto, body), { whitelist: true, forbidNonWhitelisted: true });

  it('accepts the apply numbers plus a start time and no dates or place', async () => {
    expect(await check({ teamCount: 6, legs: 2, gamesPerDay: 4, gameDurationMinutes: 25, breakMinutes: 5, time: '19:00' })).toEqual([]);
  });

  it('keeps the apply ranges and rejects a malformed time', async () => {
    const errors = await check({ teamCount: 2, legs: 3, gamesPerDay: 51, gameDurationMinutes: 4, breakMinutes: 121, time: '7pm' });
    expect(errors.map((error) => error.property).sort()).toEqual(['breakMinutes', 'gameDurationMinutes', 'gamesPerDay', 'legs', 'teamCount', 'time']);
  });

  it('rejects fields only the apply endpoint takes', async () => {
    const errors = await check({ teamCount: 4, legs: 1, time: '19:00', placeName: '운동장', replaceExisting: true });
    expect(errors.map((error) => error.property).sort()).toEqual(['placeName', 'replaceExisting']);
  });
});
