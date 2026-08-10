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
      venue: '한강 풋살장',
      date: start.toISOString().slice(0, 10),
      startTime: start.toTimeString().slice(0, 5),
    },
    ...overrides,
  };
}

describe('getMatchMissingFields — 실제 결측 필드만 지목', () => {
  it('종목·지역·제목이 이미 채워졌으면 그 필드는 결측 목록에 없다(사용자가 겪은 사고 재현 방지)', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, venue: '', date: '' } });
    const missingFieldNames = getMatchMissingFields(ctx).map((item) => item.field);

    expect(missingFieldNames).toContain('venue');
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
    const ctx = baseCtx({ draft: { ...baseCtx().draft, title: '', venue: '' } });
    const placeTimeErrors = getMatchStepErrors(ctx, 'place-time');
    const infoErrors = getMatchStepErrors(ctx, 'info');

    expect(placeTimeErrors.venue).toBeDefined();
    expect(placeTimeErrors.title).toBeUndefined();
    expect(infoErrors.title).toBeDefined();
    expect(infoErrors.venue).toBeUndefined();
  });
});

describe('getCompleteMatchSteps — CreateProgress 체크 배지 판정', () => {
  it('필수 필드를 채운 스텝만 완료로 표시한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, venue: '' } });
    const complete = getCompleteMatchSteps(ctx, ['sport', 'info', 'place-time']);

    expect(complete).toEqual(expect.arrayContaining(['sport', 'info']));
    expect(complete).not.toContain('place-time');
  });
});

describe('buildMatchPayloadResult — payload | missingFields 분기', () => {
  it('결측 필드가 있으면 payload 대신 missingFields를 반환한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, venue: '' } });
    const result = buildMatchPayloadResult(ctx.draft, ctx.sportId, ctx.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields?.some((item) => item.field === 'venue')).toBe(true);
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
    });
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
