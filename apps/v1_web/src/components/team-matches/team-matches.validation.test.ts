import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTeamMatchPayloadResult,
  firstIncompleteTeamMatchStep,
  getCompleteTeamMatchSteps,
  getTeamMatchMissingFields,
  getTeamMatchStepErrors,
  type TeamMatchValidationContext,
} from './team-matches.validation';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

function futureIso(daysAhead: number, hour = 18) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function baseCtx(overrides: Partial<TeamMatchValidationContext> = {}): TeamMatchValidationContext {
  const start = futureIso(7);
  return {
    hostTeamId: 'team-1',
    sportId: 'sport-futsal',
    regionId: 'region-gangnam',
    draft: {
      ...getTeamMatchCreateViewModel('team').draft,
      title: '주말 팀매치',
      place: { kind: 'manual', name: '잠실 풋살파크' },
      date: start.toISOString().slice(0, 10),
      startTime: start.toTimeString().slice(0, 5),
    },
    ...overrides,
  };
}

describe('getTeamMatchMissingFields — 실제 결측 필드만 지목', () => {
  it('종목·지역·제목이 이미 채워졌으면 그 필드는 결측 목록에 없다(사용자가 겪은 사고 재현 방지)', () => {
    // 사용자가 실제로 겪은 상황: 종목(풋살)·지역(서울 종로구)·제목은 채워져 있었고
    // 실제로 빈 건 장소·일시뿐이었다. 예전엔 이 상황에서도 "종목, 지역, 제목, 장소, 날짜를
    // 모두 입력해 주세요"라는 고정 문구가 떴다 — 이 테스트가 그 회귀를 잡는다.
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null, date: '' } });
    const missing = getTeamMatchMissingFields(ctx);
    const missingFieldNames = missing.map((item) => item.field);

    expect(missingFieldNames).toContain('place');
    expect(missingFieldNames).toContain('date');
    expect(missingFieldNames).not.toContain('hostTeamId');
    expect(missingFieldNames).not.toContain('sportId');
    expect(missingFieldNames).not.toContain('title');
    expect(missingFieldNames).not.toContain('regionId');
  });

  it('모든 필수값이 채워지면 결측 필드가 없다', () => {
    expect(getTeamMatchMissingFields(baseCtx())).toEqual([]);
  });

  it('과거 시각을 시작 시간으로 넣으면 startTime 규칙에 걸린다', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ctx = baseCtx({
      draft: { ...baseCtx().draft, date: past.toISOString().slice(0, 10), startTime: past.toTimeString().slice(0, 5) },
    });
    const missing = getTeamMatchMissingFields(ctx);

    expect(missing.some((item) => item.label === '시작 시간은 지금 이후로 설정해 주세요')).toBe(true);
  });

  it('신청 마감이 시작 시간보다 늦으면 deadlineTime 규칙에 걸린다', () => {
    const start = futureIso(7);
    const lateDeadline = futureIso(8); // 시작(7일 뒤)보다 늦은 마감(8일 뒤)
    const ctx = baseCtx({
      draft: {
        ...baseCtx().draft,
        date: start.toISOString().slice(0, 10),
        startTime: start.toTimeString().slice(0, 5),
        deadlineDate: lateDeadline.toISOString().slice(0, 10),
        deadlineTime: lateDeadline.toTimeString().slice(0, 5),
      },
    });
    const missing = getTeamMatchMissingFields(ctx);

    expect(missing.some((item) => item.field === 'deadlineTime')).toBe(true);
  });

  it('신청 마감을 아예 비우면 상시 접수로 통과한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, deadlineDate: '', deadlineTime: '' } });
    expect(getTeamMatchMissingFields(ctx).some((item) => item.field === 'deadlineTime')).toBe(false);
  });
});

describe('getTeamMatchStepErrors — 스텝별 즉시 검증이 다른 스텝 필드를 새지 않는다', () => {
  it('place-time 스텝에서 title 결측 에러를 보여주지 않는다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, title: '', place: null } });
    const placeTimeErrors = getTeamMatchStepErrors(ctx, 'place-time');
    const infoErrors = getTeamMatchStepErrors(ctx, 'info');

    expect(placeTimeErrors.place).toBeDefined();
    expect(placeTimeErrors.title).toBeUndefined();
    expect(infoErrors.title).toBeDefined();
    expect(infoErrors.place).toBeUndefined();
  });
});

describe('getCompleteTeamMatchSteps — CreateProgress 체크 배지 판정', () => {
  it('필수 필드를 채운 스텝만 완료로 표시한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null } });
    const complete = getCompleteTeamMatchSteps(ctx, ['team', 'sport', 'info', 'condition', 'place-time']);

    expect(complete).toEqual(expect.arrayContaining(['team', 'sport', 'info', 'condition']));
    expect(complete).not.toContain('place-time');
  });
});

describe('firstIncompleteTeamMatchStep — 진행 표시줄 클릭 이동 가드', () => {
  const order: Array<'team' | 'sport' | 'info' | 'condition' | 'place-time'> = ['team', 'sport', 'info', 'condition', 'place-time'];

  it('모든 이전 단계가 유효하면 null을 반환한다(target으로 자유 이동)', () => {
    expect(firstIncompleteTeamMatchStep(baseCtx(), order)).toBeNull();
  });

  it('중간 단계가 비어 있으면 그 단계를 반환한다(더 뒤 단계로 건너뛰지 못하게)', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, title: '' } });
    expect(firstIncompleteTeamMatchStep(ctx, order)).toBe('info');
  });

  it('검사 범위를 좁히면(steps 목록) 그 범위 밖 결측은 무시한다', () => {
    // info로 가려는 클릭은 그 앞 단계(team/sport)만 검사하면 된다 — venue는
    // place-time 스텝의 필드라 검사 범위 밖이고, 비어 있어도 이 판정을 막지 않는다.
    // (범위를 place-time까지 넓히면 같은 ctx가 'place-time'을 반환한다 — 위 105행 케이스.)
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null } });
    expect(firstIncompleteTeamMatchStep(ctx, ['team', 'sport'])).toBeNull();
  });
});

describe('buildTeamMatchPayloadResult — payload | missingFields 분기', () => {
  it.each([
    ['', null, null], ['중수', 'intermediate', 'intermediate'],
    ['초보-중수', 'novice', 'intermediate'], ['입문-고수', 'beginner', 'advanced'],
    ['B', 'intermediate', 'intermediate'],
  ])('preserves %s as the existing API range contract', (grade, minLevelCode, maxLevelCode) => {
    const ctx = baseCtx(); ctx.draft.grade = grade;
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);
    expect(result.payload).toMatchObject({ minLevelCode, maxLevelCode });
  });

  it.each(['고수-입문', 'unknown', '초보-', '입문-중수-고수'])('blocks invalid restored %s instead of saving an invented grade', (grade) => {
    const ctx = baseCtx(); ctx.draft.grade = grade;
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);
    expect(result.payload).toBeUndefined();
    expect(result.missingFields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'grade' })]));
  });

  it('결측 필드가 있으면 payload 대신 missingFields를 반환한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null } });
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields?.some((item) => item.field === 'place')).toBe(true);
  });

  it('모든 필수값이 채워지면 payload를 반환한다', () => {
    const ctx = baseCtx();
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);

    expect(result.missingFields).toBeUndefined();
    expect(result.payload).toMatchObject({
      hostTeamId: 'team-1',
      sportId: 'sport-futsal',
      regionId: 'region-gangnam',
      title: '주말 팀매치',
      manualPlaceName: '잠실 풋살파크',
    });
  });

  it('date가 빈 문자열은 아니지만 파싱 불가능한 값(손상된 draft)이면 크래시 대신 missingFields를 반환한다', () => {
    // RULES의 presence 검사(Boolean(draft.date))는 통과하지만 new Date(...)가 NaN이 되는 값 —
    // localStorage에서 복원된 draft가 깨진 경우를 흉내낸다. 예전엔 `parseStartsAt(draft) as Date`
    // 단언 후 startsAt.toISOString()을 호출해 여기서 TypeError로 죽었다.
    const ctx = baseCtx({ draft: { ...baseCtx().draft, date: 'not-a-date' } });

    expect(() => buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId)).not.toThrow();
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);
    expect(result.payload).toBeUndefined();
    const fields = result.missingFields?.map((item) => item.field);
    expect(fields).toContain('date');
    expect(fields).toContain('startTime');
  });
});

describe('regular/admin date parity', () => {
  it('rejects a past deadline instead of creating an already closed recruitment', () => {
    const ctx = baseCtx();
    ctx.draft.deadlineDate = '2000-01-01';
    ctx.draft.deadlineTime = '12:00';
    expect(buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId).missingFields)
      .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'deadlineTime' })]));
  });

  it('rejects an earlier end time instead of silently discarding it', () => {
    const ctx = baseCtx();
    ctx.draft.startTime = '20:00';
    ctx.draft.endTime = '19:00';
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);
    expect(result.payload).toBeUndefined();
    expect(result.missingFields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'endTime' })]));
  });

  it('preserves an explicit next-day end date', () => {
    const ctx = baseCtx();
    const end = futureIso(8);
    Object.assign(ctx.draft, { startTime: '23:00', endDate: end.toISOString().slice(0, 10), endTime: '01:00' });
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);
    expect(result.payload?.endsAt).toBe(new Date(`${end.toISOString().slice(0, 10)}T01:00:00+09:00`).toISOString());
  });

  it('requires an end time when an end date is supplied', () => {
    const ctx = baseCtx();
    Object.assign(ctx.draft, { endDate: ctx.draft.date, endTime: '' });
    expect(buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId).missingFields)
      .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'endTime' })]));
  });
});


it('preserves the existing elapsed deadline on edit but rejects changing it to another elapsed time', () => {
  const ctx = baseCtx();
  ctx.draft.deadlineDate = '2000-01-01';
  ctx.draft.deadlineTime = '12:00';
  const saved = '2000-01-01T03:00:00.000Z'; // 2000-01-01 12:00 KST
  expect(buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId, saved).payload?.deadlineAt).toBe(saved);
  ctx.draft.deadlineTime = '11:00';
  expect(buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId, saved).payload).toBeUndefined();
});

describe('KST 기준 검증 — 브라우저 시간대(TZ=UTC 러너)와 무관', () => {
  const NOW = new Date('2026-09-04T14:30:00.000Z'); // KST 2026-09-04 23:30
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const draftAt = (date: string, startTime: string) => ({
    ...baseCtx().draft,
    date,
    startTime,
  });
  const build = (draft: ReturnType<typeof draftAt>) =>
    buildTeamMatchPayloadResult(draft, 'team-1', 'sport-futsal', 'region-gangnam');

  it('입력한 시각을 KST 로 해석한 ISO 로 보낸다', () => {
    const result = build({
      ...draftAt('2026-10-10', '10:00'),
      endDate: '2026-10-10',
      endTime: '12:00',
      deadlineDate: '2026-10-09',
      deadlineTime: '23:59',
    });
    expect(result.payload).toMatchObject({
      startsAt: '2026-10-10T01:00:00.000Z',
      endsAt: '2026-10-10T03:00:00.000Z',
      deadlineAt: '2026-10-09T14:59:00.000Z',
    });
  });

  it('과거/미래 경계를 KST 자정 근처에서 정확히 가른다', () => {
    // 지금은 KST 23:30. 로컬(UTC) 해석이면 23:00 이 미래, 00:30 이 과거로 뒤집힌다.
    const past = build(draftAt('2026-09-04', '23:00'));
    expect(past.payload).toBeUndefined();
    expect(past.missingFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'startTime', label: '시작 시간은 지금 이후로 설정해 주세요' })]),
    );
    expect(build(draftAt('2026-09-05', '00:30')).payload?.startsAt).toBe('2026-09-04T15:30:00.000Z');
  });

  it('마감도 KST 로 지금과 비교한다', () => {
    const base = draftAt('2026-09-05', '10:00');
    expect(build({ ...base, deadlineDate: '2026-09-04', deadlineTime: '23:00' }).payload).toBeUndefined();
    expect(build({ ...base, deadlineDate: '2026-09-04', deadlineTime: '23:59' }).payload?.deadlineAt)
      .toBe('2026-09-04T14:59:00.000Z');
  });

  it('입력했는데 해석되지 않는 종료·마감은 오류로 잡는다 — 입력 안 함(오류 없음)과 구분한다', () => {
    const base = draftAt('2026-10-10', '10:00');
    const fieldsOf = (draft: ReturnType<typeof draftAt>) => build(draft).missingFields?.map((item) => item.field) ?? [];

    expect(fieldsOf({ ...base, endDate: 'broken', endTime: '12:00' })).toContain('endTime');
    expect(fieldsOf({ ...base, deadlineDate: 'broken', deadlineTime: '12:00' })).toContain('deadlineTime');
    // 대조군: 비어 있으면 오류 없이 null 로 저장된다.
    expect(build(base).payload).toMatchObject({ endsAt: null, deadlineAt: null });
  });
});
