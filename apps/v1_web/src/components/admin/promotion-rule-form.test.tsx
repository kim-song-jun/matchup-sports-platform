import { describe, expect, it } from 'vitest';
import { previewSlots, hitsMajorityGuard } from './promotion-rule-form';
import { V1_DEFAULT_PROMOTION_RULE, type V1PromotionRule } from '@/types/league-series';

const RULE = V1_DEFAULT_PROMOTION_RULE;

// 이 미리보기가 서버(league-promotion.ts 의 baseSlots)와 다르면 어드민이 "2팀 강등"인 줄
// 알고 저장했는데 실제로는 3팀이 강등된다. 두 구현이 갈리는 순간 여기서 깨져야 한다.
describe('previewSlots — 서버 baseSlots 와 같은 결과를 내야 한다', () => {
  it.each([
    [5, 1],
    [8, 2],
    [12, 3],
  ])('비례 20%% 올림: %i팀 → %i팀', (teamCount, expected) => {
    expect(previewSlots(RULE, teamCount)).toBe(expected);
  });

  it('반올림으로 바꾸면 12팀은 2팀이다 (올림 3팀과 갈린다)', () => {
    expect(previewSlots({ ...RULE, rounding: 'round' }, 12)).toBe(2);
    expect(previewSlots({ ...RULE, rounding: 'ceil' }, 12)).toBe(3);
  });

  it('내림이라도 minSlots 아래로는 내려가지 않는다', () => {
    // 4 * 0.2 = 0.8 → 내림 0. minSlots 가 없으면 승강이 0건이 되어 규칙이 무의미해진다.
    expect(previewSlots({ mode: 'ratio', ratio: 0.2, rounding: 'floor', minSlots: 1 }, 4)).toBe(1);
  });

  it('빈 티어는 0이다 — minSlots 를 적용하면 팀이 없는데 "1팀 승격"으로 보인다', () => {
    // 서버 baseSlots 는 teamCount === 0 이면 0 을 반환한다. 여기가 갈리면 화면이 거짓말을 한다.
    expect(previewSlots(RULE, 0)).toBe(0);
    expect(previewSlots({ mode: 'fixed', fixedCount: 3, minSlots: 1 }, 0)).toBe(0);
  });

  it('mode=fixed 는 팀 수와 무관하게 고정값을 쓴다', () => {
    const fixed: V1PromotionRule = { mode: 'fixed', fixedCount: 3, minSlots: 1 };
    expect(previewSlots(fixed, 8)).toBe(3);
    expect(previewSlots(fixed, 20)).toBe(3);
  });
});

describe('hitsMajorityGuard — 서버가 승강을 건너뛰는 조건을 미리 보여준다', () => {
  it('3팀 리그는 1승격+1강등이 과반을 넘어 걸린다', () => {
    // floor(3/2) = 1 인데 승격 1 + 강등 1 = 2 > 1
    expect(hitsMajorityGuard(RULE, 3)).toBe(true);
  });

  it('4팀 리그는 1승격+1강등=2 가 floor(4/2)=2 이하라 통과한다', () => {
    expect(hitsMajorityGuard(RULE, 4)).toBe(false);
  });

  it('8팀·12팀처럼 팀이 넉넉하면 걸리지 않는다', () => {
    expect(hitsMajorityGuard(RULE, 8)).toBe(false);
    expect(hitsMajorityGuard(RULE, 12)).toBe(false);
  });

  it('비율을 과하게 올리면 큰 리그에서도 걸린다', () => {
    // 10팀에 50% → 5팀씩 승강. 승격 5 + 강등 5 = 10 > floor(10/2) = 5
    expect(hitsMajorityGuard({ ...RULE, ratio: 0.5 }, 10)).toBe(true);
  });
});
