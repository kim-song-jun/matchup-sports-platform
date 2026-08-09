import { describe, expect, it } from 'vitest';
import {
  buildTeamMatchPayloadResult,
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
      venue: '잠실 풋살파크',
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
    const ctx = baseCtx({ draft: { ...baseCtx().draft, venue: '', date: '' } });
    const missing = getTeamMatchMissingFields(ctx);
    const missingFieldNames = missing.map((item) => item.field);

    expect(missingFieldNames).toContain('venue');
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
    const ctx = baseCtx({ draft: { ...baseCtx().draft, title: '', venue: '' } });
    const placeTimeErrors = getTeamMatchStepErrors(ctx, 'place-time');
    const infoErrors = getTeamMatchStepErrors(ctx, 'info');

    expect(placeTimeErrors.venue).toBeDefined();
    expect(placeTimeErrors.title).toBeUndefined();
    expect(infoErrors.title).toBeDefined();
    expect(infoErrors.venue).toBeUndefined();
  });
});

describe('getCompleteTeamMatchSteps — CreateProgress 체크 배지 판정', () => {
  it('필수 필드를 채운 스텝만 완료로 표시한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, venue: '' } });
    const complete = getCompleteTeamMatchSteps(ctx, ['team', 'sport', 'info', 'condition', 'place-time']);

    expect(complete).toEqual(expect.arrayContaining(['team', 'sport', 'info', 'condition']));
    expect(complete).not.toContain('place-time');
  });
});

describe('buildTeamMatchPayloadResult — payload | missingFields 분기', () => {
  it('결측 필드가 있으면 payload 대신 missingFields를 반환한다', () => {
    const ctx = baseCtx({ draft: { ...baseCtx().draft, venue: '' } });
    const result = buildTeamMatchPayloadResult(ctx.draft, ctx.hostTeamId, ctx.sportId, ctx.regionId);

    expect(result.payload).toBeUndefined();
    expect(result.missingFields?.some((item) => item.field === 'venue')).toBe(true);
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
