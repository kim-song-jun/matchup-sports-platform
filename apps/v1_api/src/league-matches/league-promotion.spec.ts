import {
  calculatePromotions,
  validatePromotionRule,
  tierSlotCounts,
  promotionRuleFingerprint,
  DEFAULT_PROMOTION_RULE,
  type PromotionRule,
  type TierStandingsInput,
} from './league-promotion';
import type { LeagueStanding } from './league-standings';

/** 순위표 스텁 — 승강 계산은 position 과 teamId 만 본다. */
function standings(teamIds: readonly string[]): LeagueStanding[] {
  return teamIds.map((teamId, index) => ({
    teamId,
    position: index + 1,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
}

function tier(tierNo: number, teamIds: readonly string[]): TierStandingsInput {
  return { tier: tierNo, standings: standings(teamIds) };
}

function teamIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

function kindsOf(plan: ReturnType<typeof calculatePromotions>, tierNo: number): string[] {
  return plan.tiers.find((t) => t.tier === tierNo)!.entries.map((e) => e.computedKind);
}

const RULE = DEFAULT_PROMOTION_RULE as PromotionRule;

describe('calculatePromotions — 슬롯 수 (비례 20% · 올림 · 최소 1)', () => {
  // 사용자 확정 기준(Task 153): 5팀→1 / 8팀→2 / 12팀→3. 반올림이 아니라 올림이다.
  it.each([
    [5, 1],
    [8, 2],
    [12, 3],
  ])('%i팀 티어의 승강 슬롯은 %i개다', (count, expected) => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', count)), tier(2, teamIds('B', count)), tier(3, teamIds('C', count))],
    });
    const middle = plan.tiers.find((t) => t.tier === 2)!;
    expect(middle.promoteCount).toBe(expected);
    expect(middle.relegateCount).toBe(expected);
  });

  it('12팀은 반올림(2)이 아니라 올림(3)이다 — 규칙이 바뀌면 여기서 깨진다', () => {
    const plan = calculatePromotions({
      tierCount: 2,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 12)), tier(2, teamIds('B', 12))],
    });
    expect(plan.tiers.find((t) => t.tier === 1)!.relegateCount).toBe(3);
  });

  it('rounding=round 로 바꾸면 12팀은 2개가 된다', () => {
    const plan = calculatePromotions({
      tierCount: 2,
      rule: { ...RULE, rounding: 'round' },
      tiers: [tier(1, teamIds('A', 12)), tier(2, teamIds('B', 12))],
    });
    expect(plan.tiers.find((t) => t.tier === 1)!.relegateCount).toBe(2);
  });
});

describe('calculatePromotions — 티어 경계', () => {
  it('1부는 승격이 없고 강등만 있다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, teamIds('B', 10)), tier(3, teamIds('C', 10))],
    });
    const top = plan.tiers.find((t) => t.tier === 1)!;
    expect(top.promoteCount).toBe(0);
    expect(top.relegateCount).toBe(2);
    expect(kindsOf(plan, 1)).toEqual([
      'stayed', 'stayed', 'stayed', 'stayed', 'stayed', 'stayed', 'stayed', 'stayed',
      'relegated', 'relegated',
    ]);
  });

  it('최하위 티어는 강등이 없고 승격만 있다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, teamIds('B', 10)), tier(3, teamIds('C', 10))],
    });
    const bottom = plan.tiers.find((t) => t.tier === 3)!;
    expect(bottom.promoteCount).toBe(2);
    expect(bottom.relegateCount).toBe(0);
    expect(kindsOf(plan, 3).slice(0, 2)).toEqual(['promoted', 'promoted']);
    expect(kindsOf(plan, 3).slice(-1)).toEqual(['stayed']);
  });

  it('tierCount=1 이면 승격도 강등도 없다 — 전원 잔류', () => {
    const plan = calculatePromotions({
      tierCount: 1,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 8))],
    });
    expect(kindsOf(plan, 1).every((k) => k === 'stayed')).toBe(true);
    expect(plan.tiers[0].nextSeasonTeamCount).toBe(8);
  });

  it('승격 팀은 toTier 가 한 단계 위, 강등 팀은 한 단계 아래', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, teamIds('B', 10)), tier(3, teamIds('C', 10))],
    });
    const middle = plan.tiers.find((t) => t.tier === 2)!;
    expect(middle.entries[0]).toMatchObject({ computedKind: 'promoted', toTier: 1 });
    expect(middle.entries[9]).toMatchObject({ computedKind: 'relegated', toTier: 3 });
    expect(middle.entries[4]).toMatchObject({ computedKind: 'stayed', toTier: 2 });
  });
});

describe('calculatePromotions — 잔류 과반 가드', () => {
  it('3팀 티어는 1승격+1강등이 과반을 넘어 승강을 건너뛴다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, ['B1', 'B2', 'B3']), tier(3, teamIds('C', 10))],
    });
    const middle = plan.tiers.find((t) => t.tier === 2)!;
    expect(middle.skippedByMajorityGuard).toBe(true);
    expect(middle.promoteCount).toBe(0);
    expect(middle.relegateCount).toBe(0);
    expect(kindsOf(plan, 2)).toEqual(['stayed', 'stayed', 'stayed']);
    expect(plan.warnings.some((w) => w.tier === 2 && w.code === 'MAJORITY_GUARD_SKIPPED')).toBe(true);
  });

  it('4팀 티어는 1승격+1강등=2 가 floor(4/2)=2 이하라 통과한다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, ['B1', 'B2', 'B3', 'B4']), tier(3, teamIds('C', 10))],
    });
    const middle = plan.tiers.find((t) => t.tier === 2)!;
    expect(middle.skippedByMajorityGuard).toBe(false);
    expect(kindsOf(plan, 2)).toEqual(['promoted', 'stayed', 'stayed', 'relegated']);
  });

  it('가드가 걸린 티어만 건너뛰고 다른 티어는 정상 계산된다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, ['B1', 'B2', 'B3']), tier(3, teamIds('C', 10))],
    });
    expect(plan.tiers.find((t) => t.tier === 1)!.relegateCount).toBe(2);
    expect(plan.tiers.find((t) => t.tier === 3)!.promoteCount).toBe(2);
  });
});

describe('calculatePromotions — 다음 시즌 예상 팀 수', () => {
  it('승격 수와 강등 수가 다르면 다음 시즌 팀 수가 변한다', () => {
    // 1부 12팀(강등 3) · 2부 8팀(승격 2, 강등 2) · 3부 8팀(승격 2)
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 12)), tier(2, teamIds('B', 8)), tier(3, teamIds('C', 8))],
    });
    const [t1, t2, t3] = plan.tiers;
    expect(t1).toMatchObject({ relegateCount: 3, promoteCount: 0 });
    expect(t2).toMatchObject({ promoteCount: 2, relegateCount: 2 });
    expect(t3).toMatchObject({ promoteCount: 2, relegateCount: 0 });
    expect(t1.nextSeasonTeamCount).toBe(12 - 3 + 2); // 11
    expect(t2.nextSeasonTeamCount).toBe(8 - 2 - 2 + 3 + 2); // 9
    expect(t3.nextSeasonTeamCount).toBe(8 - 2 + 2); // 8
  });

  it('전체 팀 수는 승강으로 변하지 않는다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 12)), tier(2, teamIds('B', 8)), tier(3, teamIds('C', 8))],
    });
    const before = plan.tiers.reduce((sum, t) => sum + t.teamCount, 0);
    const after = plan.tiers.reduce((sum, t) => sum + t.nextSeasonTeamCount, 0);
    expect(after).toBe(before);
  });
});

describe('calculatePromotions — 어드민 설정 반영', () => {
  it('mode=fixed 는 팀 수와 무관하게 고정 슬롯을 쓴다', () => {
    const plan = calculatePromotions({
      tierCount: 2,
      rule: { mode: 'fixed', fixedCount: 3, minSlots: 1 },
      tiers: [tier(1, teamIds('A', 20)), tier(2, teamIds('B', 20))],
    });
    expect(plan.tiers.find((t) => t.tier === 1)!.relegateCount).toBe(3);
  });

  it('tierOverrides 로 특정 티어의 슬롯만 덮어쓴다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: { ...RULE, tierOverrides: { '1': { relegate: 4 } } },
      tiers: [tier(1, teamIds('A', 10)), tier(2, teamIds('B', 10)), tier(3, teamIds('C', 10))],
    });
    expect(plan.tiers.find((t) => t.tier === 1)!.relegateCount).toBe(4);
    // 덮어쓰지 않은 티어는 규칙대로 2개
    expect(plan.tiers.find((t) => t.tier === 2)!.relegateCount).toBe(2);
  });

  it('override 로 0 을 주면 그 방향 승강을 끈다', () => {
    const plan = calculatePromotions({
      tierCount: 2,
      rule: { ...RULE, tierOverrides: { '2': { promote: 0 } } },
      tiers: [tier(1, teamIds('A', 10)), tier(2, teamIds('B', 10))],
    });
    expect(plan.tiers.find((t) => t.tier === 2)!.promoteCount).toBe(0);
    expect(kindsOf(plan, 2).every((k) => k === 'stayed')).toBe(true);
  });

  it('빈 티어는 경고를 내고 승강 0건으로 둔다', () => {
    const plan = calculatePromotions({
      tierCount: 3,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, teamIds('B', 10))],
    });
    expect(plan.warnings.some((w) => w.tier === 3 && w.code === 'EMPTY_TIER')).toBe(true);
    expect(plan.tiers.find((t) => t.tier === 3)!.entries).toEqual([]);
  });
});

describe('calculatePromotions — 빈 티어', () => {
  it('팀이 0인 티어는 슬롯도 0이다 (minSlots 를 적용하지 않는다)', () => {
    const plan = calculatePromotions({
      tierCount: 2,
      rule: RULE,
      tiers: [tier(1, teamIds('A', 10)), tier(2, [])],
    });
    const empty = plan.tiers.find((t) => t.tier === 2)!;
    expect(empty.promoteCount).toBe(0);
    expect(empty.relegateCount).toBe(0);
  });
});

describe('validatePromotionRule', () => {
  it('기본 규칙은 통과한다', () => {
    expect(validatePromotionRule(RULE)).toEqual([]);
  });

  it('ratio 가 0.5 를 넘으면 거부한다 — 한 시즌에 과반이 이동하면 리그가 아니다', () => {
    const errors = validatePromotionRule({ mode: 'ratio', ratio: 0.6 });
    expect(errors.map((e) => e.field)).toContain('ratio');
  });

  it('ratio 가 0 이하면 거부한다', () => {
    expect(validatePromotionRule({ mode: 'ratio', ratio: 0 })).not.toEqual([]);
  });

  it('mode=ratio 인데 ratio 가 없으면 거부한다', () => {
    expect(validatePromotionRule({ mode: 'ratio' }).map((e) => e.field)).toContain('ratio');
  });

  it('mode=fixed 인데 fixedCount 가 0 이면 거부한다', () => {
    expect(validatePromotionRule({ mode: 'fixed', fixedCount: 0 }).map((e) => e.field)).toContain('fixedCount');
  });

  it('minSlots 가 0 이면 거부한다', () => {
    expect(validatePromotionRule({ ...RULE, minSlots: 0 }).map((e) => e.field)).toContain('minSlots');
  });

  it('tierOverrides 의 음수 슬롯을 거부한다', () => {
    const errors = validatePromotionRule({ ...RULE, tierOverrides: { '1': { relegate: -1 } } });
    expect(errors.map((e) => e.field)).toContain('tierOverrides.1.relegate');
  });

  it('알 수 없는 rounding 값을 거부한다', () => {
    const errors = validatePromotionRule({ ...RULE, rounding: 'nearest' as never });
    expect(errors.map((e) => e.field)).toContain('rounding');
  });
});

// ── Task 153 하드닝 (감사 2026-08-21) ──────────────────────────────────────
describe('validatePromotionRule — tierOverrides 값 타입', () => {
  const RULE_R: PromotionRule = { mode: 'ratio', ratio: 0.2, rounding: 'ceil', minSlots: 1 };

  // alpha 실측: tierOverrides:{"1":null} 이 DTO(@IsObject)를 통과해 서비스에서
  // TypeError 로 터지며 500 이 나갔다. 검증기가 값 타입을 직접 막아야 한다.
  it('tierOverrides 값이 null 이면 던지지 않고 거부한다', () => {
    expect(() => validatePromotionRule({ ...RULE_R, tierOverrides: { '1': null as never } })).not.toThrow();
    const errors = validatePromotionRule({ ...RULE_R, tierOverrides: { '1': null as never } });
    expect(errors.map((e) => e.field)).toContain('tierOverrides.1');
  });

  it('tierOverrides 값이 객체가 아니면 조용히 무시하지 않고 거부한다', () => {
    for (const bad of [42, 'abc', true, []]) {
      const errors = validatePromotionRule({ ...RULE_R, tierOverrides: { '2': bad as never } });
      expect(errors.map((e) => e.field)).toContain('tierOverrides.2');
    }
  });

  it('정상 객체 override 는 통과시킨다', () => {
    expect(validatePromotionRule({ ...RULE_R, tierOverrides: { '1': { relegate: 2 } } })).toEqual([]);
  });
});

describe('tierSlotCounts — 프론트/백엔드 공용 계산', () => {
  const RULE_R: PromotionRule = { mode: 'ratio', ratio: 0.2, rounding: 'ceil', minSlots: 1 };

  // alpha 감사에서 프론트 hitsMajorityGuard 가 티어 위치를 모른 채 항상 2*slots 로
  // 판정해 24개 조합 중 15개가 서버와 어긋났다. 두 쪽이 같은 함수를 써야 한다.
  it('1부는 승격이 없다', () => {
    expect(tierSlotCounts(RULE_R, 1, 3, 8)).toMatchObject({ promoteCount: 0, relegateCount: 2 });
  });

  it('최하위 티어는 강등이 없다', () => {
    expect(tierSlotCounts(RULE_R, 3, 3, 8)).toMatchObject({ promoteCount: 2, relegateCount: 0 });
  });

  it('중간 티어는 승격·강등 둘 다 있다', () => {
    expect(tierSlotCounts(RULE_R, 2, 3, 8)).toMatchObject({ promoteCount: 2, relegateCount: 2 });
  });

  it('단일 티어 시리즈는 승강이 아예 없고 과반 가드도 걸리지 않는다', () => {
    expect(tierSlotCounts(RULE_R, 1, 1, 8)).toMatchObject({
      promoteCount: 0, relegateCount: 0, skippedByMajorityGuard: false,
    });
  });

  it('minSlots=3·8팀: 1부/최하위는 가드에 안 걸리고 중간 티어만 걸린다', () => {
    const rule: PromotionRule = { ...RULE_R, minSlots: 3 };
    expect(tierSlotCounts(rule, 1, 3, 8).skippedByMajorityGuard).toBe(false);
    expect(tierSlotCounts(rule, 2, 3, 8).skippedByMajorityGuard).toBe(true);
    expect(tierSlotCounts(rule, 3, 3, 8).skippedByMajorityGuard).toBe(false);
  });

  it('calculatePromotions 결과와 정확히 일치한다', () => {
    const rule: PromotionRule = { mode: 'ratio', ratio: 0.5, rounding: 'ceil', minSlots: 1 };
    const plan = calculatePromotions({
      tierCount: 3,
      rule,
      tiers: [tier(1, teamIds('a', 8)), tier(2, teamIds('b', 8)), tier(3, teamIds('c', 8))],
    });
    for (const result of plan.tiers) {
      expect(tierSlotCounts(rule, result.tier, 3, result.teamCount)).toEqual({
        promoteCount: result.promoteCount,
        relegateCount: result.relegateCount,
        skippedByMajorityGuard: result.skippedByMajorityGuard,
      });
    }
  });
});

describe('promotionRuleFingerprint — preview~commit 사이 규칙 변경 감지', () => {
  it('키 순서가 달라도 같은 규칙이면 같은 값이다', () => {
    const a = promotionRuleFingerprint({ mode: 'ratio', ratio: 0.2, minSlots: 1, rounding: 'ceil' });
    const b = promotionRuleFingerprint({ rounding: 'ceil', minSlots: 1, ratio: 0.2, mode: 'ratio' } as PromotionRule);
    expect(a).toBe(b);
  });

  it('규칙이 달라지면 값이 달라진다', () => {
    const before = promotionRuleFingerprint({ mode: 'ratio', ratio: 0.5, rounding: 'ceil', minSlots: 1 });
    const after = promotionRuleFingerprint({ mode: 'fixed', fixedCount: 1, minSlots: 1 });
    expect(before).not.toBe(after);
  });

  it('tierOverrides 의 키 순서도 정규화한다', () => {
    const a = promotionRuleFingerprint({ mode: 'fixed', fixedCount: 1, tierOverrides: { '2': { relegate: 1 }, '1': { promote: 2 } } });
    const b = promotionRuleFingerprint({ mode: 'fixed', fixedCount: 1, tierOverrides: { '1': { promote: 2 }, '2': { relegate: 1 } } });
    expect(a).toBe(b);
  });
});
