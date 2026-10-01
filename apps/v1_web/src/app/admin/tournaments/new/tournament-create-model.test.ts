import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildTournamentCreatePayload,
  INITIAL_TOURNAMENT_CREATE_STATE,
  isShortLeadTime,
  tournamentCreateReducer,
  validateTournamentCreateStep,
} from './tournament-create-model';

/**
 * 대회 마감 일시의 **자동 제안과 검증**에 하한이 없어서, 시작이 임박한 대회를 만들면
 * 명단 제출 마감이 **이미 지난 시각**으로 채워지고 그대로 저장됐다(2026-09-04 alpha 실측:
 * 시작 +3일 대회의 명단 마감이 -4일). 그 대회는 `assertRosterMutable` 이 409
 * `ROSTER_DEADLINE_PASSED` 로 막기 때문에 **어떤 팀도 명단을 제출할 수 없다.**
 *
 * 순수 함수라 시계를 고정해서 검증한다.
 */
describe('대회 생성 — 마감 일시 하한', () => {
  // 2026-09-04(금) 10:00 KST = 01:00 UTC
  const NOW = new Date('2026-09-04T01:00:00.000Z');
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  /** `datetime-local` 입력값 포맷(로컬 시각) — 화면이 넘기는 것과 같은 모양이어야 한다. */
  const toDatetimeLocal = (at: Date) =>
    new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const withScheduledAt = (value: string) =>
    tournamentCreateReducer(
      { ...INITIAL_TOURNAMENT_CREATE_STATE, step: 1 },
      { type: 'set-scheduled-at', value },
    );


  it('대회 시작이 3일 이내면 신청 마감도 자동으로 채우지 않는다', () => {
    // D-3 규칙도 같은 구멍이다 — 시작 +2일이면 신청 마감이 어제가 된다.
    const state = withScheduledAt('2026-09-06T10:00');
    expect(state.registrationDeadlineAt).toBe('');
  });

  it('여유가 충분하면 신청 마감은 D-3 을 채우고, 명단 마감은 비워 둔다', () => {
    // 명단 마감을 시작 기준(D-7)으로 채우면 신청 마감(D-3)보다 앞서 신청 중에 명단이 먼저 닫혔다.
    // 비워 두면 마감 없이 고칠 수 있다(사용자 확정 2026-10-01).
    const state = withScheduledAt('2026-10-04T10:00');
    expect(state.registrationDeadlineAt).toBe('2026-10-01T23:59');
    expect(state.rosterDeadlineAt).toBe('');
  });

  it('명단 마감을 직접 넣은 뒤 시작일을 바꿔도 그 값을 지우거나 덮지 않는다', () => {
    const withRoster = tournamentCreateReducer(
      { ...INITIAL_TOURNAMENT_CREATE_STATE, step: 1 },
      { type: 'set-roster-deadline', value: '2026-10-02T23:59' },
    );
    const state = tournamentCreateReducer(withRoster, { type: 'set-scheduled-at', value: '2026-10-10T10:00' });
    expect(state.rosterDeadlineAt).toBe('2026-10-02T23:59');
  });

  it('명단 마감을 과거로 직접 넣으면 검증이 막는다', () => {
    const errors = validateTournamentCreateStep(
      {
        ...INITIAL_TOURNAMENT_CREATE_STATE,
        step: 1,
        scheduledAt: '2026-09-07T10:00',
        registrationDeadlineAt: '2026-09-05T23:59',
        rosterDeadlineAt: '2026-08-31T23:59',
      },
      1,
    );
    expect(errors.rosterDeadlineAt).toBe('명단 제출 마감은 지금 이후여야 해요.');
  });

  it('신청 마감을 과거로 직접 넣어도 검증이 막는다 — 두 필드를 따로 잡아야 한다', () => {
    // 한쪽만 고치면 반쪽이다. 같은 `suggestDeadline` 을 두 곳이 부른다.
    const errors = validateTournamentCreateStep(
      {
        ...INITIAL_TOURNAMENT_CREATE_STATE,
        step: 1,
        scheduledAt: '2026-09-07T10:00',
        registrationDeadlineAt: '2026-09-01T23:59',
        rosterDeadlineAt: '2026-09-05T23:59',
      },
      1,
    );
    expect(errors.registrationDeadlineAt).toBe('신청 마감은 지금 이후여야 해요.');
  });

  it('미래 마감은 통과한다 (회귀 방지)', () => {
    const errors = validateTournamentCreateStep(
      {
        ...INITIAL_TOURNAMENT_CREATE_STATE,
        step: 1,
        scheduledAt: '2026-10-04T10:00',
        registrationDeadlineAt: '2026-10-01T23:59',
        rosterDeadlineAt: '2026-10-02T23:59',
      },
      1,
    );
    expect(errors.registrationDeadlineAt).toBeUndefined();
    expect(errors.rosterDeadlineAt).toBeUndefined();
  });

  it('시작일이 과거면 "N일 이내" 경고를 띄우지 않는다 — 남은 시간이 음수라 항상 참이 되던 자리', () => {
    // `start - now <= N일` 만 보면 **과거 시작일은 음수**라 무조건 통과한다. 그러면 이미 지난
    // 대회를 불러오거나 날짜를 잘못 넣었을 때 "대회 시작이 N일 이내예요" 라는 엉뚱한 경고가 뜬다.
    expect(isShortLeadTime('2026-09-01T10:00')).toBe(false);
    expect(isShortLeadTime('2020-01-01T10:00')).toBe(false);
  });

  it('시작일이 과거면 검증이 막고, 마감 오류가 아니라 시작일 문제라고 말한다', () => {
    // 마감 검증만 있으면 과거 시작일이 "마감은 대회 시작 전이어야 해요" 같은 **엉뚱한 필드의**
    // 오류로 나타난다. 원인이 있는 필드에서 말해야 운영자가 고칠 곳을 안다.
    const errors = validateTournamentCreateStep(
      {
        ...INITIAL_TOURNAMENT_CREATE_STATE,
        step: 1,
        scheduledAt: '2026-09-01T10:00',
        registrationDeadlineAt: '2026-09-10T23:59',
        rosterDeadlineAt: '2026-09-10T23:59',
      },
      1,
    );
    expect(errors.scheduledAt).toBe('대회 시작 일시는 지금 이후여야 해요.');
    // 그리고 **마감 필드는 빨개지지 않아야 한다.** 시작일이 이미 틀렸는데 "마감은 대회 시작
    // 전이어야 해요" 까지 함께 뜨면, 운영자는 멀쩡한 마감을 고치려 든다. 원인 하나에 오류 하나다.
    expect(errors.registrationDeadlineAt).toBeUndefined();
    expect(errors.rosterDeadlineAt).toBeUndefined();
  });

  it('시작이 3일(신청 마감 제안일) 이내인지 알려 준다 — 화면이 경고 배너를 띄우는 근거', () => {
    expect(isShortLeadTime('2026-09-06T10:00')).toBe(true);
    // 명단 마감 D-7 제안이 없어졌으므로 4~7일 남은 대회에는 경고하지 않는다.
    expect(isShortLeadTime('2026-09-09T10:00')).toBe(false);
    // 경계: 문구가 "3일 이내" 이므로 **정확히 3일**도 경고 대상이다.
    // 리터럴 날짜로 쓰면 `datetime-local` 값이 **로컬 타임존으로 파싱**되므로 TZ 가 다른
    // 환경(로컬 KST / CI UTC)에서 결과가 갈린다 — NOW 에서 계산해 로컬 포맷으로 만든다.
    expect(isShortLeadTime(toDatetimeLocal(new Date(NOW.getTime() + THREE_DAYS)))).toBe(true);
    expect(isShortLeadTime(toDatetimeLocal(new Date(NOW.getTime() + THREE_DAYS + 60_000)))).toBe(false);
    // 값이 없거나 형식이 깨지면 경고하지 않는다(입력 중에 배너가 깜빡이면 안 된다).
    expect(isShortLeadTime('')).toBe(false);
    expect(isShortLeadTime('not-a-date')).toBe(false);
  });
});

// 명단 마감이 신청 마감보다 앞서면 신청을 받는 중에 명단이 먼저 닫힌다(alpha 실데이터 2건, 마법사 기본값 그대로).
// 서버 ROSTER_DEADLINE_BEFORE_REGISTRATION_DEADLINE 과 같은 규칙.
describe('대회 생성 — 명단 마감은 신청 마감과 같거나 그 뒤', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T01:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const validate = (deadlines: { registrationDeadlineAt: string; rosterDeadlineAt: string }) =>
    validateTournamentCreateStep(
      { ...INITIAL_TOURNAMENT_CREATE_STATE, step: 1, scheduledAt: '2026-10-04T10:00', ...deadlines },
      1,
    );

  it('신청 마감보다 앞서면 막는다', () => {
    const errors = validate({ registrationDeadlineAt: '2026-10-01T23:59', rosterDeadlineAt: '2026-09-27T23:59' });
    expect(errors.rosterDeadlineAt).toBe('명단 제출 마감은 신청 마감과 같거나 그 뒤여야 해요.');
  });

  it.each([
    ['같으면', '2026-10-01T23:59'],
    ['뒤면', '2026-10-02T23:59'],
    ['비우면', ''],
  ])('%s 통과한다', (_label, rosterDeadlineAt) => {
    const errors = validate({ registrationDeadlineAt: '2026-10-01T23:59', rosterDeadlineAt });
    expect(errors.rosterDeadlineAt).toBeUndefined();
  });

  it('신청 마감이 비면 순서 규칙은 건너뛰고 신청 마감 필수만 말한다', () => {
    const errors = validate({ registrationDeadlineAt: '', rosterDeadlineAt: '2026-09-27T23:59' });
    expect(errors.rosterDeadlineAt).toBeUndefined();
    expect(errors.registrationDeadlineAt).toBe('신청 마감 일시를 선택해 주세요.');
  });
});

it('명단 마감을 비우면 payload 에 null 을 싣는다 — 초안을 이어 고칠 때(PATCH) 지운 마감이 서버에 남지 않게', () => {
  // undefined 를 보내면 서버 update 가 "안 건드림"으로 읽어 예전 마감이 그대로 남는다.
  const payload = buildTournamentCreatePayload({ ...INITIAL_TOURNAMENT_CREATE_STATE, rosterDeadlineAt: '' });
  expect(payload.rosterDeadlineAt).toBeNull();
});
