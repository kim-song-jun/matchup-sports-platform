import { kstDayKey, resolveLeagueWeekNumbers } from './league-week-number';

/** 2026-09-09 22:00 KST = 2026-09-09T13:00Z */
const kst = (iso: string) => new Date(iso);

describe('resolveLeagueWeekNumbers', () => {
  it('서로 다른 KST 경기일을 오름차순으로 세어 주차를 매긴다', () => {
    const days = [kst('2026-09-09T13:00:00Z'), kst('2026-09-16T13:00:00Z'), kst('2026-09-23T13:00:00Z')];
    const weeks = resolveLeagueWeekNumbers(
      new Map([['lg', days]]),
      days.map((startAt, index) => ({ id: `fx${index}`, leagueId: 'lg', startAt })),
    );
    expect([weeks.get('fx0'), weeks.get('fx1'), weeks.get('fx2')]).toEqual([1, 2, 3]);
  });

  it('같은 날 여러 경기는 모두 같은 주차다 — 하루에 여러 경기를 치르는 리그가 실재한다', () => {
    const day = kst('2026-09-09T13:00:00Z');
    const later = kst('2026-09-09T13:20:00Z');
    const weeks = resolveLeagueWeekNumbers(
      new Map([['lg', [day, later, kst('2026-09-16T13:00:00Z')]]]),
      [
        { id: 'a', leagueId: 'lg', startAt: day },
        { id: 'b', leagueId: 'lg', startAt: later },
        { id: 'c', leagueId: 'lg', startAt: kst('2026-09-16T13:00:00Z') },
      ],
    );
    expect([weeks.get('a'), weeks.get('b'), weeks.get('c')]).toEqual([1, 1, 2]);
  });

  it('재일정으로 순서가 바뀌면 주차도 따라 바뀐다 — 저장된 제목을 쓰지 않는 이유', () => {
    // 원래 2주차였던 경기를 1주차보다 앞으로 당기면, 그 경기가 1주차가 되어야 한다.
    const moved = kst('2026-09-02T13:00:00Z');
    const other = kst('2026-09-09T13:00:00Z');
    const weeks = resolveLeagueWeekNumbers(new Map([['lg', [moved, other]]]), [
      { id: 'moved', leagueId: 'lg', startAt: moved },
      { id: 'other', leagueId: 'lg', startAt: other },
    ]);
    expect(weeks.get('moved')).toBe(1);
    expect(weeks.get('other')).toBe(2);
  });

  it('KST 경계를 UTC 로 세지 않는다 — 09:00Z 는 이미 다음 날 KST 다', () => {
    // 2026-09-08T15:00Z = 2026-09-09 00:00 KST → 09-09 과 같은 날이어야 한다.
    expect(kstDayKey(kst('2026-09-08T15:00:00Z'))).toBe(kstDayKey(kst('2026-09-09T13:00:00Z')));
  });

  it('친선 팀매치(leagueId=null)는 결과에 담기지 않는다', () => {
    const weeks = resolveLeagueWeekNumbers(new Map(), [
      { id: 'friendly', leagueId: null, startAt: kst('2026-09-09T13:00:00Z') },
    ]);
    expect(weeks.has('friendly')).toBe(false);
  });

  it('형제 목록에서 자기 경기일을 못 찾으면 1주차로 폴백한다', () => {
    const weeks = resolveLeagueWeekNumbers(new Map([['lg', [kst('2026-09-09T13:00:00Z')]]]), [
      { id: 'orphan', leagueId: 'lg', startAt: kst('2026-10-01T13:00:00Z') },
    ]);
    expect(weeks.get('orphan')).toBe(1);
  });
});
