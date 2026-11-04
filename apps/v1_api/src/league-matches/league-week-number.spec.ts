import { kstDayKey, kstWeekKey, resolveLeagueWeekNumbers } from './league-week-number';

/** 2026-09-09 22:00 KST = 2026-09-09T13:00Z */
const kst = (iso: string) => new Date(iso);

describe('resolveLeagueWeekNumbers', () => {
  it('경기가 있는 KST 달력 주를 오름차순으로 세어 주차를 매긴다', () => {
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

  // 2026-11-03 사용자 확정: 주차는 경기일 순번이 아니라 달력 주(월~일)다.
  it('토·일에 나눠 치른 한 주는 같은 주차이고, 다음 주가 다음 주차다', () => {
    const sat = kst('2026-11-21T01:00:00Z'); // 11/21(토) 10:00 KST
    const sun = kst('2026-11-22T01:00:00Z'); // 11/22(일) 10:00 KST
    const nextSat = kst('2026-11-28T01:00:00Z');
    const weeks = resolveLeagueWeekNumbers(new Map([['lg', [sat, sun, nextSat]]]), [
      { id: 'sat', leagueId: 'lg', startAt: sat },
      { id: 'sun', leagueId: 'lg', startAt: sun },
      { id: 'next', leagueId: 'lg', startAt: nextSat },
    ]);
    expect([weeks.get('sat'), weeks.get('sun'), weeks.get('next')]).toEqual([1, 1, 2]);
  });

  it('경기가 없는 주는 번호를 건너뛰지 않는다 — 쉬는 주 다음 경기는 바로 다음 주차다', () => {
    const first = kst('2026-11-14T01:00:00Z');
    const afterBreak = kst('2026-11-28T01:00:00Z'); // 11/21 주는 경기 없음
    const weeks = resolveLeagueWeekNumbers(new Map([['lg', [first, afterBreak]]]), [
      { id: 'after', leagueId: 'lg', startAt: afterBreak },
    ]);
    expect(weeks.get('after')).toBe(2);
  });

  it('주의 경계는 KST 월요일 0시다 — 일요일 23:30 과 월요일 0:30 은 다른 주다', () => {
    expect(kstWeekKey(kst('2026-11-22T14:30:00Z'))).toBe('2026-11-16'); // 11/22(일) 23:30 KST
    expect(kstWeekKey(kst('2026-11-22T15:30:00Z'))).toBe('2026-11-23'); // 11/23(월) 00:30 KST
    expect(kstWeekKey(kst('2026-11-16T00:00:00Z'))).toBe('2026-11-16'); // 월요일 09:00 KST 그 자신
  });

  it('친선 팀매치(leagueId=null)는 결과에 담기지 않는다', () => {
    const weeks = resolveLeagueWeekNumbers(new Map(), [
      { id: 'friendly', leagueId: null, startAt: kst('2026-09-09T13:00:00Z') },
    ]);
    expect(weeks.has('friendly')).toBe(false);
  });

  it('형제 목록에서 자기 주를 못 찾으면 1주차로 폴백한다', () => {
    const weeks = resolveLeagueWeekNumbers(new Map([['lg', [kst('2026-09-09T13:00:00Z')]]]), [
      { id: 'orphan', leagueId: 'lg', startAt: kst('2026-10-01T13:00:00Z') },
    ]);
    expect(weeks.get('orphan')).toBe(1);
  });
});
