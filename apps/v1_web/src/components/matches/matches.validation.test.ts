import { describe, expect, it } from 'vitest';
import {
  buildMatchPayloadResult,
  getCompleteMatchSteps,
  getMatchMissingFields,
  getMatchStepErrors,
  type MatchValidationContext,
} from './matches.validation';
import { getMatchCreateViewModel } from './matches.view-model';

function futureIso(daysAhead: number, hour = 18) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function baseCtx(overrides: Partial<MatchValidationContext> = {}): MatchValidationContext {
  const start = futureIso(7);
  return {
    sportId: 'sport-futsal',
    regionId: 'region-gangnam',
    draft: {
      ...getMatchCreateViewModel('sport').draft,
      title: '주말 풋살 매치',
      place: { kind: 'manual', name: '한강 풋살장' },
      date: start.toISOString().slice(0, 10),
      startTime: start.toTimeString().slice(0, 5),
    },
    ...overrides,
  };
}

describe('getMatchMissingFields — 실제 결측 필드만 지목', () => {
  it('종목·지역·제목이 이미 채워졌으면 그 필드는 결측 목록에 없다(사용자가 겪은 사고 재현 방지)', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null, date: '' } });
    const missingFieldNames = getMatchMissingFields(ctx).map((item) => item.field);

    expect(missingFieldNames).toContain('place');
    expect(missingFieldNames).toContain('date');
    expect(missingFieldNames).not.toContain('sportId');
    expect(missingFieldNames).not.toContain('title');
    expect(missingFieldNames).not.toContain('regionId');
  });

  it('모든 필수값이 채워지면 결측 필드가 없다', () => {
    expect(getMatchMissingFields(baseCtx())).toEqual([]);
  });

  it('과거 시각을 시작 시간으로 넣으면 startTime 규칙에 걸린다', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ctx = baseCtx({
      draft: { ...baseCtx().draft, date: past.toISOString().slice(0, 10), startTime: past.toTimeString().slice(0, 5) },
    });

    expect(getMatchMissingFields(ctx).some((item) => item.label === '시작 시간은 지금 이후로 설정해 주세요')).toBe(true);
  });
});

describe('getMatchStepErrors — 스텝별 즉시 검증이 다른 스텝 필드를 새지 않는다', () => {
  it('place-time 스텝에서 title 결측 에러를 보여주지 않는다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, title: '', place: null } });
    const placeTimeErrors = getMatchStepErrors(ctx, 'place-time');
    const infoErrors = getMatchStepErrors(ctx, 'info');

    expect(placeTimeErrors.place).toBeDefined();
    expect(placeTimeErrors.title).toBeUndefined();
    expect(infoErrors.title).toBeDefined();
    expect(infoErrors.place).toBeUndefined();
  });
});

describe('개인 매치 종료 시간 — 단계와 제출이 같은 시간 순서를 검증한다', () => {
  it.each(['09:00', '10:00', 'not-a-time', '24:00', '11:60'])('10:00 시작에 %s 종료는 endTime 오류로 다음과 payload를 차단한다', (endTime) => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, startTime: '10:00', endTime } });
    const before = { ...ctx.draft };

    expect(buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId)).toEqual({
      missingFields: [{ field: 'endTime', label: '종료 시간은 시작 시간보다 늦어야 해요', step: 'place-time' }],
    });
    expect(getMatchStepErrors(ctx, 'place-time')).toEqual({ endTime: '종료 시간은 시작 시간보다 늦어야 해요' });
    expect(getMatchStepErrors(ctx, 'info')).toEqual({});
    expect(getCompleteMatchSteps(ctx, ['sport', 'info', 'place-time'])).not.toContain('place-time');
    expect(ctx.draft).toEqual(before);
  });

  it.each(['11:00', '23:59', ''])('10:00 시작에 종료가 %s이면 정상 시간과 종료 생략을 보존한다', (endTime) => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, startTime: '10:00', endTime } });
    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(getMatchStepErrors(ctx, 'place-time')).toEqual({});
    expect(getCompleteMatchSteps(ctx, ['sport', 'info', 'place-time'])).toContain('place-time');
    expect(result.missingFields).toBeUndefined();
    expect(result.payload).toMatchObject({
      startsAt: new Date(`${ctx.draft.date}T10:00:00`).toISOString(),
      endsAt: endTime ? new Date(`${ctx.draft.date}T${endTime}:00`).toISOString() : null,
    });
  });
});

describe('명시적 종료 날짜 — API가 지원하는 익일 시각과 손상된 초안을 구분한다', () => {
  it('종료 날짜를 다음 날로 명시한 10:00→09:00은 실제 다음 날 ISO만 payload로 보낸다', () => {
    const base = baseCtx();
    const nextDay = new Date(`${base.draft.date}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = nextDay.toISOString().slice(0, 10);
    const draft = { ...base.draft, startTime: '10:00', endTime: '09:00', endDate };
    const ctx = baseCtx({ draft });

    expect(getMatchStepErrors(ctx, 'place-time')).toEqual({});
    const result = buildMatchPayloadResult(draft, ctx.sportId, ctx.regionId);
    expect(result.missingFields).toBeUndefined();
    expect(result.payload).toMatchObject({
      startsAt: new Date(`${draft.date}T10:00:00`).toISOString(), endsAt: new Date(`${endDate}T09:00:00`).toISOString(),
    });
    expect(result.payload).not.toHaveProperty('endDate');
    expect(result.payload).not.toHaveProperty('endTime');
  });

  it('같은 종료 날짜를 명시해도 시작 이하 종료를 익일로 보정하지 않는다', () => {
    const base = baseCtx();
    const draft = { ...base.draft, startTime: '10:00', endTime: '09:00', endDate: base.draft.date };
    const ctx = baseCtx({ draft });

    expect(buildMatchPayloadResult(draft, ctx.sportId, ctx.regionId).missingFields).toContainEqual({
      field: 'endTime', label: '종료 시간은 시작 시간보다 늦어야 해요', step: 'place-time',
    });
  });

  it.each(['not-a-date', '2099-02-30', '2099-13-01'])('손상된 종료 날짜 %s는 시작 날짜로 대체하거나 정규화해 저장하지 않는다', (endDate) => {
    const draft = { ...baseCtx().draft, startTime: '10:00', endTime: '11:00', endDate };
    const ctx = baseCtx({ draft });
    const result = buildMatchPayloadResult(draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields).toContainEqual({ field: 'endDate', label: '종료 날짜를 확인해 주세요', step: 'place-time' });
  });

  it('종료 날짜만 있으면 종료 시간도 요구하고 null 종료로 저장하지 않는다', () => {
    const base = baseCtx();
    const draft = { ...base.draft, endDate: base.draft.date, endTime: '' };
    const result = buildMatchPayloadResult(draft, base.sportId, base.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields).toContainEqual({ field: 'endTime', label: '종료 시간도 입력해 주세요', step: 'place-time' });
  });
});

describe('getCompleteMatchSteps — CreateProgress 체크 배지 판정', () => {
  it('필수 필드를 채운 스텝만 완료로 표시한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null } });
    const complete = getCompleteMatchSteps(ctx, ['sport', 'info', 'place-time']);

    expect(complete).toEqual(expect.arrayContaining(['sport', 'info']));
    expect(complete).not.toContain('place-time');
  });
});

describe('buildMatchPayloadResult — payload | missingFields 분기', () => {
  it('결측 필드가 있으면 payload 대신 missingFields를 반환한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, place: null } });
    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields?.some((item) => item.field === 'place')).toBe(true);
  });

  it('모든 필수값이 채워지면 payload를 반환한다', () => {
    const ctx = baseCtx();
    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.missingFields).toBeUndefined();
    expect(result.payload).toMatchObject({
      sportId: 'sport-futsal',
      regionId: 'region-gangnam',
      title: '주말 풋살 매치',
      manualPlaceName: '한강 풋살장',
      hostParticipates: true,
    });
  });

  it('주최자 참가를 끄면 payload에 hostParticipates=false를 보존한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, hostParticipates: false } });

    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toMatchObject({ hostParticipates: false });
  });

  it('주최자가 참가하지 않으면 최대 인원 1명을 그대로 payload에 보존한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, capacity: 1, hostParticipates: false } });

    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toMatchObject({ capacity: 1 });
  });

  it('주최자가 참가하면 최대 인원 1명은 2명으로 올려서 payload를 만든다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, capacity: 1, hostParticipates: true } });

    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toMatchObject({ capacity: 2 });
  });

  it('date가 빈 문자열은 아니지만 파싱 불가능한 값(손상된 draft)이면 크래시 대신 missingFields를 반환한다', () => {
    // RULES의 presence 검사(Boolean(draft.date))는 통과하지만 new Date(...)가 NaN이 되는 값 —
    // localStorage에서 복원된 draft가 깨진 경우를 흉내낸다. 예전엔 `parseStartsAt(draft) as Date`
    // 단언 후 startsAt.toISOString()을 호출해 여기서 TypeError로 죽었다.
    const ctx = baseCtx({ draft: { ...baseCtx().draft, date: 'not-a-date' } });

    expect(() => buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId)).not.toThrow();
    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);
    expect(result.payload).toBeUndefined();
    const fields = result.missingFields?.map((item) => item.field);
    expect(fields).toContain('date');
    expect(fields).toContain('startTime');
  });
});

describe('신청 마감일/마감시간 부분 입력 — 한쪽만 채우면 조용히 마감 없음으로 저장되던 결함', () => {
  // start는 baseCtx()가 7일 뒤로 잡으므로 마감은 그보다 이른 3일 뒤로 둬 '마감<시작' 규칙과
  // 겹치지 않게 한다.
  const deadline = futureIso(3);
  const deadlineDate = deadline.toISOString().slice(0, 10);
  const deadlineTime = deadline.toTimeString().slice(0, 5);

  it('마감일만 고르고 마감시간을 비우면 deadlineTime이 결측 필드로 지목된다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, deadlineDate, deadlineTime: '' } });

    const missing = getMatchMissingFields(ctx);
    expect(missing.some((item) => item.field === 'deadlineTime')).toBe(true);
  });

  it('마감시간만 고르고 마감일을 비우면 deadlineDate가 결측 필드로 지목된다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, deadlineDate: '', deadlineTime } });

    const missing = getMatchMissingFields(ctx);
    expect(missing.some((item) => item.field === 'deadlineDate')).toBe(true);
  });

  it('한쪽만 채운 상태로는 buildMatchPayloadResult가 payload 대신 missingFields를 반환한다(마감 없음으로 조용히 저장되지 않는다)', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, deadlineDate, deadlineTime: '' } });
    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields?.some((item) => item.field === 'deadlineTime')).toBe(true);
  });

  it('둘 다 비우면 여전히 유효하다(마감 없음이 의도된 정책)', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, deadlineDate: '', deadlineTime: '' } });

    expect(getMatchMissingFields(ctx).some((item) => item.field === 'deadlineDate' || item.field === 'deadlineTime')).toBe(false);
  });

  it('둘 다 채우면 유효하다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, deadlineDate, deadlineTime } });

    expect(getMatchMissingFields(ctx).some((item) => item.field === 'deadlineDate' || item.field === 'deadlineTime')).toBe(false);
  });
});
