import { describe, expect, it } from 'vitest';
import {
  applyPromoFactDefaults,
  buildTournamentPromoFactDefaults,
  EMPTY_PROMO_FACTS_DIRTY,
  markChangedPromoFacts,
} from './tournament-promo-defaults';

const EMPTY_SOURCE = {
  scheduledAt: '',
  scheduledEndAt: '',
  teamCount: '',
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
    ).toBe('8/29 (토)');

    expect(
      buildTournamentPromoFactDefaults({
        ...EMPTY_SOURCE,
        scheduledAt: '2026-08-29T09:00',
        scheduledEndAt: '2026-08-30T18:00',
      }).dateText,
    ).toBe('8/29 (토)~8/30 (일)');
  });

  it('팀 수·장소를 문구로 만들고, 팀 수가 0이거나 비면 빈 문자열을 준다', () => {
    const filled = buildTournamentPromoFactDefaults({
      ...EMPTY_SOURCE,
      teamCount: '16',
      venue: '  서울월드컵보조경기장  ',
    });
    expect(filled.teamsText).toBe('16팀');
    expect(filled.locationText).toBe('서울월드컵보조경기장');

    expect(buildTournamentPromoFactDefaults({ ...EMPTY_SOURCE, teamCount: '0' }).teamsText).toBe('');
    expect(buildTournamentPromoFactDefaults(EMPTY_SOURCE).teamsText).toBe('');
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

  it('아무 정보도 없으면 네 문구 모두 빈 문자열이다', () => {
    expect(buildTournamentPromoFactDefaults(EMPTY_SOURCE)).toEqual({
      dateText: '',
      teamsText: '',
      locationText: '',
      prizeText: '',
    });
  });
});

describe('applyPromoFactDefaults', () => {
  const value = { dateText: '', teamsText: '기존 팀 문구', locationText: '', prizeText: '' };
  const defaults = {
    dateText: '8/29 (토)',
    teamsText: '16팀',
    locationText: '서울구장',
    prizeText: '',
  };

  it('dirty가 아닌 문구만 기본값으로 채운다', () => {
    const next = applyPromoFactDefaults(value, defaults, {
      ...EMPTY_PROMO_FACTS_DIRTY,
      teamsText: true,
    });
    expect(next.dateText).toBe('8/29 (토)');
    expect(next.locationText).toBe('서울구장');
    expect(next.teamsText).toBe('기존 팀 문구');
  });

  it('기본값이 빈 문자열이면 기존 값을 지우지 않는다', () => {
    const next = applyPromoFactDefaults(
      { ...value, prizeText: '관리자가 쓴 상금' },
      defaults,
      EMPTY_PROMO_FACTS_DIRTY,
    );
    expect(next.prizeText).toBe('관리자가 쓴 상금');
  });

  it('바뀔 게 없으면 같은 객체를 그대로 돌려준다', () => {
    const same = { dateText: '8/29 (토)', teamsText: '16팀', locationText: '서울구장', prizeText: '' };
    expect(applyPromoFactDefaults(same, defaults, EMPTY_PROMO_FACTS_DIRTY)).toBe(same);
  });
});

describe('markChangedPromoFacts', () => {
  const previous = { dateText: '8/29 (토)', teamsText: '16팀', locationText: '', prizeText: '' };

  it('실제로 바뀐 문구만 dirty로 표시한다', () => {
    const dirty = markChangedPromoFacts(
      previous,
      { ...previous, teamsText: '16개 팀 참가' },
      EMPTY_PROMO_FACTS_DIRTY,
    );
    expect(dirty.teamsText).toBe(true);
    expect(dirty.dateText).toBe(false);
  });

  it('빈 칸으로 지운 것도 관리자의 선택이므로 dirty다', () => {
    const dirty = markChangedPromoFacts(
      previous,
      { ...previous, dateText: '' },
      EMPTY_PROMO_FACTS_DIRTY,
    );
    expect(dirty.dateText).toBe(true);
  });

  it('바뀐 게 없으면 기존 dirty 객체를 그대로 돌려준다', () => {
    expect(markChangedPromoFacts(previous, { ...previous }, EMPTY_PROMO_FACTS_DIRTY)).toBe(
      EMPTY_PROMO_FACTS_DIRTY,
    );
  });
});
