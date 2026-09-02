import { resolveLeagueFixtureDates } from './league-fixture-dates';

/** 판정 기준 시각 — 2026-09-10 12:00 KST. */
const now = new Date('2026-09-10T03:00:00.000Z');

/** KST 벽시계로 읽어 단언한다 — UTC ISO 로 비교하면 오프셋 실수를 눈으로 못 잡는다. */
const kst = (at: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(at);

describe('resolveLeagueFixtureDates', () => {
  it('날짜를 KST 벽시계로 해석한다 — 서버 타임존에 의존하지 않는다', () => {
    const result = resolveLeagueFixtureDates({ dates: ['2026-09-12'], time: '19:30' }, 1, now);
    expect(result.ok).toBe(true);
    // 19:30 KST 는 10:30 UTC 다. 오프셋을 빼먹으면 여기가 어긋난다.
    expect(result.ok && result.startAts[0].toISOString()).toBe('2026-09-12T10:30:00.000Z');
    expect(result.ok && kst(result.startAts[0])).toBe('2026-09-12 19:30');
  });

  it('라운드 배정은 **날짜 오름차순**이다 — 입력 순서가 아니다', () => {
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-09-26', '2026-09-12', '2026-09-19'], time: '19:00' },
      3,
      now,
    );
    expect(result.ok && result.startAts.map(kst)).toEqual([
      '2026-09-12 19:00',
      '2026-09-19 19:00',
      '2026-09-26 19:00',
    ]);
  });

  it('중복 날짜는 제거한다 — 같은 날을 두 번 고른 건 "그 날에 두 라운드"가 아니라 실수다', () => {
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-09-12', '2026-09-12', '2026-09-19'], time: '19:00' },
      2,
      now,
    );
    expect(result.ok && result.startAts.map(kst)).toEqual(['2026-09-12 19:00', '2026-09-19 19:00']);
  });

  it('중복 제거 **뒤**의 수가 라운드보다 적으면 거부하고, 그 수를 보고한다', () => {
    // 세 개를 골랐지만 서로 다른 날은 둘뿐이다 — provided 는 3 이 아니라 2 여야
    // "몇 개를 더 골라야 하는지" 가 맞는다.
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-09-12', '2026-09-12', '2026-09-19'], time: '19:00' },
      3,
      now,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'insufficient', required: 3, provided: 2 } });
  });

  it('과거 날짜는 거부하고 어느 날짜인지 돌려준다', () => {
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-09-05', '2026-09-12'], time: '19:00' },
      2,
      now,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'past', dates: ['2026-09-05'] } });
  });

  it('같은 날이라도 시각이 지났으면 과거다 — 날짜만 보지 않는다', () => {
    // now 는 2026-09-10 12:00 KST. 같은 날 09:00 은 이미 지났다.
    const past = resolveLeagueFixtureDates({ dates: ['2026-09-10'], time: '09:00' }, 1, now);
    expect(past.ok).toBe(false);
    const future = resolveLeagueFixtureDates({ dates: ['2026-09-10'], time: '19:00' }, 1, now);
    expect(future.ok).toBe(true);
  });

  it('날짜가 라운드보다 많으면 앞에서부터 필요한 만큼만 쓴다', () => {
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-09-12', '2026-09-19', '2026-09-26'], time: '19:00' },
      2,
      now,
    );
    expect(result.ok && result.startAts.map(kst)).toEqual(['2026-09-12 19:00', '2026-09-19 19:00']);
  });

  it('달력에 없는 날짜는 거부한다 — Date.UTC 가 다음 달로 굴리기 전에 막는다', () => {
    // 2026 은 평년이라 2월 31일도 30일도 29일도 없다. DTO 정규식(`3[01]`)은 전부 통과시키고
    // `Date.UTC(2026, 1, 31)` 은 에러 대신 **2026-03-03** 을 준다 — 사흘 뒤 경기가 조용히 생긴다.
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-02-31', '2026-09-12'], time: '19:00' },
      1,
      now,
    );
    expect(result).toEqual({ ok: false, error: { kind: 'invalid', dates: ['2026-02-31'] } });
  });

  it('굴러가는 방향이 달라도 잡는다 — 이 함수의 계약은 DTO 정규식보다 넓다', () => {
    // 이건 방어가 아니라 **계약**이다. 이 함수는 exported 순수 함수라 DTO 를 안 지나는
    // 호출자(스펙·다른 진입점·정규식 완화)가 얼마든지 생긴다. 세 필드를 다 비교하는
    // 왕복 검사가 필요한 이유를 여기서 고정한다:
    //   · 13월 → 다음 **해**로 구른다(연이 어긋난다)
    //   · 0월/0일 → 이전 달로 구른다(연·월이 어긋난다)
    // 월만 비교하면 13월이 통과한다.
    for (const date of ['2026-13-01', '2026-00-10', '2026-01-00']) {
      const result = resolveLeagueFixtureDates({ dates: [date], time: '19:00' }, 1, now);
      expect(result).toEqual({ ok: false, error: { kind: 'invalid', dates: [date] } });
    }
  });

  it('달력에 있는 경계 날짜는 통과한다 — 전부 거부하는 가드와 구분한다', () => {
    // 막는 것만 보면 **모두 invalid 로 만들어도 통과**한다. 통과해야 할 것도 확인한다:
    // 31일이 있는 달의 31일 · 윤년 2월 29일.
    const result = resolveLeagueFixtureDates(
      { dates: ['2026-10-31', '2028-02-29'], time: '19:00' },
      2,
      now,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.startAts.map(kst)).toEqual(['2026-10-31 19:00', '2028-02-29 19:00']);
  });
});
