import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PromotionRuleForm } from './promotion-rule-form';
import { previewSlots, tierSlotPreview } from './promotion-rule-form';
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

describe('tierSlotPreview — 서버 tierSlotCounts 와 같은 판정을 내야 한다', () => {
  // 3티어 시리즈의 중간 티어(승격·강등 둘 다 있음)를 기준으로 한 기존 케이스들.
  const mid = (rule: V1PromotionRule, teamCount: number) => tierSlotPreview(rule, 2, 3, teamCount);

  it('3팀 티어는 1승격+1강등이 과반을 넘어 걸린다', () => {
    // floor(3/2) = 1 인데 승격 1 + 강등 1 = 2 > 1
    expect(mid(RULE, 3).skippedByMajorityGuard).toBe(true);
  });

  it('4팀 티어는 1승격+1강등=2 가 floor(4/2)=2 이하라 통과한다', () => {
    expect(mid(RULE, 4).skippedByMajorityGuard).toBe(false);
  });

  it('8팀·12팀처럼 팀이 넉넉하면 걸리지 않는다', () => {
    expect(mid(RULE, 8).skippedByMajorityGuard).toBe(false);
    expect(mid(RULE, 12).skippedByMajorityGuard).toBe(false);
  });

  it('비율을 과하게 올리면 큰 티어에서도 걸린다', () => {
    // 10팀에 50% → 5팀씩 승강. 승격 5 + 강등 5 = 10 > floor(10/2) = 5
    expect(mid({ ...RULE, ratio: 0.5 }, 10).skippedByMajorityGuard).toBe(true);
  });

  // ── 티어 위치를 무시하던 옛 구현이 서버와 어긋났던 지점들 ──────────────────
  // 옛 hitsMajorityGuard 는 언제나 slots*2 로 판정해 아래를 전부 틀렸다.
  it('1부는 승격이 없어 강등만 계산한다', () => {
    expect(tierSlotPreview(RULE, 1, 3, 6)).toEqual({
      promoteCount: 0, relegateCount: 2, skippedByMajorityGuard: false,
    });
  });

  it('최하위 티어는 강등이 없어 승격만 계산한다', () => {
    expect(tierSlotPreview(RULE, 3, 3, 6)).toEqual({
      promoteCount: 2, relegateCount: 0, skippedByMajorityGuard: false,
    });
  });

  it('단일 티어 시리즈는 승강이 아예 없고 가드도 걸리지 않는다', () => {
    expect(tierSlotPreview(RULE, 1, 1, 6)).toEqual({
      promoteCount: 0, relegateCount: 0, skippedByMajorityGuard: false,
    });
  });

  it('minSlots=3·8팀: 폼이 "건너뜀"이라 경고하던 1부에서 서버는 실제로 3팀을 강등시킨다', () => {
    const rule: V1PromotionRule = { ...RULE, minSlots: 3 };
    expect(tierSlotPreview(rule, 1, 3, 8)).toEqual({
      promoteCount: 0, relegateCount: 3, skippedByMajorityGuard: false,
    });
    // 중간 티어만 실제로 가드에 걸린다.
    expect(tierSlotPreview(rule, 2, 3, 8).skippedByMajorityGuard).toBe(true);
  });
});


// 규칙 값을 부모가 들고 있는 실제 사용 형태 그대로 확인한다.
function Harness({ onRule }: { onRule: (rule: V1PromotionRule) => void }) {
  const [rule, setRule] = useState<V1PromotionRule>({ ...V1_DEFAULT_PROMOTION_RULE });
  return (
    <PromotionRuleForm
      value={rule}
      tierCount={3}
      onChange={(next) => {
        setRule(next);
        onRule(next);
      }}
    />
  );
}

describe('PromotionRuleForm — 숫자 입력', () => {
  it('입력을 지워도 규칙에 0 이 박히지 않는다 (서버가 422 로 거부하는 값)', async () => {
    const user = userEvent.setup();
    let latest: V1PromotionRule = { ...V1_DEFAULT_PROMOTION_RULE };
    render(<Harness onRule={(rule) => { latest = rule; }} />);

    await user.clear(screen.getByLabelText('비율 (%)'));

    // 화면은 빈 칸을 유지하되(고치는 중이므로), 규칙은 직전 유효값을 지킨다.
    expect(screen.getByLabelText('비율 (%)')).toHaveValue(null);
    expect(latest.ratio).toBe(0.2);
  });

  it('지운 뒤 새 값을 치면 앞자리가 남지 않는다', async () => {
    const user = userEvent.setup();
    let latest: V1PromotionRule = { ...V1_DEFAULT_PROMOTION_RULE };
    render(<Harness onRule={(rule) => { latest = rule; }} />);

    const input = screen.getByLabelText('비율 (%)');
    await user.clear(input);
    await user.type(input, '5');

    // 즉시 최솟값으로 되돌리는 구현이었다면 "15"(1 뒤에 5)가 됐을 자리다.
    expect(input).toHaveValue(5);
    expect(latest.ratio).toBe(0.05);
  });

  it('최소 승강 팀 수를 지워도 0 이 되지 않는다', async () => {
    const user = userEvent.setup();
    let latest: V1PromotionRule = { ...V1_DEFAULT_PROMOTION_RULE };
    render(<Harness onRule={(rule) => { latest = rule; }} />);

    await user.clear(screen.getByLabelText('최소 승강 팀 수'));

    expect(latest.minSlots).toBe(1);
  });
});
