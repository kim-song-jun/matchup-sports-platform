import { describe, expect, it } from 'vitest';
import { buildTournamentPromoFactDefaults } from './tournament-promo-defaults';

const EMPTY_SOURCE = {
  scheduledAt: '',
  scheduledEndAt: '',
  venue: '',
  prizePool: '',
  prizeSummary: '',
};

describe('buildTournamentPromoFactDefaults', () => {
  it('하루짜리 대회는 단일 날짜로, 여러 날이면 범위로 만든다', () => {
    expect(
      buildTournamentPromoFactDefaults({
        ...EMPTY_SOURCE,
        scheduledAt: '2026-08-29T09:00',
        scheduledEndAt: '2026-08-29T18:00',
      }).dateText,
    ).toBe('8월 29일 (토)');

    expect(
      buildTournamentPromoFactDefaults({
        ...EMPTY_SOURCE,
        scheduledAt: '2026-08-29T09:00',
        scheduledEndAt: '2026-08-30T18:00',
      }).dateText,
    ).toBe('8월 29일 (토)~8월 30일 (일)');
  });

  it('장소는 앞뒤 공백을 털어 그대로 쓴다', () => {
    expect(
      buildTournamentPromoFactDefaults({ ...EMPTY_SOURCE, venue: '  서울월드컵보조경기장  ' })
        .locationText,
    ).toBe('서울월드컵보조경기장');
  });

  it('강조 문구는 파생 대상이 아니다 — 운영에서 팀 수가 아닌 상태 문구로 쓰고 있다', () => {
    const defaults = buildTournamentPromoFactDefaults({ ...EMPTY_SOURCE, venue: '서울구장' });
    expect(Object.keys(defaults).sort()).toEqual(['dateText', 'locationText', 'prizeText']);
  });

  it('상금 문구는 요약이 우선이고, 요약이 없으면 총 상금을 쓴다', () => {
    expect(
      buildTournamentPromoFactDefaults({
        ...EMPTY_SOURCE,
        prizeSummary: '우승팀 트로피 + 100만원',
        prizePool: '3000000',
      }).prizeText,
    ).toBe('우승팀 트로피 + 100만원');

    expect(
      buildTournamentPromoFactDefaults({ ...EMPTY_SOURCE, prizePool: '3000000' }).prizeText,
    ).toBe('총 상금 3,000,000원');

    expect(buildTournamentPromoFactDefaults({ ...EMPTY_SOURCE, prizePool: '0' }).prizeText).toBe('');
  });

  it('아무 정보도 없으면 세 문구 모두 빈 문자열이다', () => {
    expect(buildTournamentPromoFactDefaults(EMPTY_SOURCE)).toEqual({
      dateText: '',
      locationText: '',
      prizeText: '',
    });
  });
});
