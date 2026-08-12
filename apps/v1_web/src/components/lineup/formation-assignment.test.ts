import { describe, expect, it } from 'vitest';
import {
  applyAssignmentToEntries,
  describeFormationChange,
  planFormationAssignment,
  type AssignableEntry,
} from './formation-assignment';
import type { FormationSlot } from './formation-slots';

/**
 * 포메이션 전환 재배치 회귀 테스트.
 *
 * 실제 사용자 결함(2026-08 제보)을 그대로 재현한다: 프리셋을 바꾸면 이미 배치한 선수가
 * 피치에서 조용히 사라졌다. 원인은 슬롯↔선수 짝짓기가 positionCode 완전일치만 봤기
 * 때문이다 — 새 프리셋에 그 코드 슬롯이 없으면(1-2-1의 ALA 2명 → 2-2엔 ALA 슬롯 0개)
 * 매칭에서 탈락하고, 슬롯 모드 렌더는 매칭된 선수만 그리므로 화면에서 증발했다.
 * 더 나쁜 건 탈락한 선수의 positionX/Y가 그대로 남아 저장 페이로드에는 실렸다는 점이다
 * (화면엔 없는 선수가 DB에는 옛 좌표로 저장 = 화면과 DB 불일치).
 *
 * 아래 테스트는 전부 그 결함이 되살아나면 깨진다.
 */

// 서버 lineupConfig(풋살)에서 실제로 내려오는 좌표를 그대로 쓴다 —
// competition-config.presets.ts의 FUTSAL_FORMATIONS와 동일해야 회귀 가치가 있다.
const GK_SLOT: FormationSlot = { positionCode: 'GK', label: 'GK', x: 50, y: 6 };

const DIAMOND_1_2_1: FormationSlot[] = [
  GK_SLOT,
  { positionCode: 'FIXO', label: '픽소', x: 50, y: 35 },
  { positionCode: 'ALA', label: '아라', x: 20, y: 58 },
  { positionCode: 'ALA', label: '아라', x: 80, y: 58 },
  { positionCode: 'PIVO', label: '피보', x: 50, y: 83 },
];

const BOX_2_2: FormationSlot[] = [
  GK_SLOT,
  { positionCode: 'FIXO', label: '픽소', x: 28, y: 38 },
  { positionCode: 'FIXO', label: '픽소', x: 72, y: 38 },
  { positionCode: 'PIVO', label: '피보', x: 28, y: 76 },
  { positionCode: 'PIVO', label: '피보', x: 72, y: 76 },
];

function entry(overrides: Partial<AssignableEntry> & { key: string }): AssignableEntry {
  return {
    key: overrides.key,
    displayName: overrides.displayName ?? `선수-${overrides.key}`,
    goalkeeper: overrides.goalkeeper ?? false,
    position: overrides.position ?? null,
    positionX: overrides.positionX ?? null,
    positionY: overrides.positionY ?? null,
  };
}

/** 1-2-1 다이아몬드로 다섯 자리를 모두 채운 상태(GK 포함) — 전환 테스트의 출발점. */
function fullyPlacedDiamond(): AssignableEntry[] {
  return [
    entry({ key: 'gk', displayName: '김골키', goalkeeper: true, positionX: 50, positionY: 6 }),
    entry({ key: 'fixo', displayName: '박픽소', position: 'FIXO', positionX: 50, positionY: 35 }),
    entry({ key: 'alaL', displayName: '이아라', position: 'ALA', positionX: 20, positionY: 58 }),
    entry({ key: 'alaR', displayName: '최아라', position: 'ALA', positionX: 80, positionY: 58 }),
    entry({ key: 'pivo', displayName: '정피보', position: 'PIVO', positionX: 50, positionY: 83 }),
  ];
}

describe('planFormationAssignment', () => {
  it('1-2-1 → 2-2로 바꿔도 ALA 2명이 사라지지 않고 남은 자리를 받는다 (사용자 제보 결함)', () => {
    const plan = planFormationAssignment(BOX_2_2, fullyPlacedDiamond());

    // 2-2에는 ALA 슬롯이 아예 없다. 예전 코드라면 alaL/alaR이 매칭에서 탈락해
    // 피치에서 증발했다 — 이제는 남은 FIXO/PIVO 자리를 받아야 한다.
    const assignedKeys = plan.slotAssignments.map((row) => row.entryKey);
    expect(assignedKeys).not.toContain(null);
    expect(new Set(assignedKeys)).toEqual(new Set(['gk', 'fixo', 'alaL', 'alaR', 'pivo']));
    expect(plan.unplacedKeys).toEqual([]);
  });

  it('골키퍼는 GK 슬롯에만 배정된다', () => {
    const plan = planFormationAssignment(BOX_2_2, fullyPlacedDiamond());

    const gkRow = plan.slotAssignments.find((row) => row.slot.positionCode === 'GK');
    expect(gkRow?.entryKey).toBe('gk');
    // 필드 슬롯 어디에도 골키퍼가 끼어들지 않아야 한다.
    const fieldKeys = plan.slotAssignments
      .filter((row) => row.slot.positionCode !== 'GK')
      .map((row) => row.entryKey);
    expect(fieldKeys).not.toContain('gk');
  });

  it('같은 positionCode를 이미 가진 선수가 그 코드 슬롯을 우선 차지한다', () => {
    const plan = planFormationAssignment(BOX_2_2, fullyPlacedDiamond());

    // 박픽소(FIXO)는 FIXO 슬롯 중 하나를, 정피보(PIVO)는 PIVO 슬롯 중 하나를 받아야 한다.
    const slotCodeOf = (key: string) =>
      plan.slotAssignments.find((row) => row.entryKey === key)?.slot.positionCode;
    expect(slotCodeOf('fixo')).toBe('FIXO');
    expect(slotCodeOf('pivo')).toBe('PIVO');
  });

  it('배치된 선수가 슬롯보다 많으면 남는 선수만 대기로 내려간다', () => {
    // 슬롯 5개(GK+4)인데 배치된 선수는 6명 — 한 명은 자리를 못 받는다.
    const starters = [
      ...fullyPlacedDiamond(),
      entry({ key: 'extra', displayName: '남는선수', position: 'ALA', positionX: 10, positionY: 90 }),
    ];
    const plan = planFormationAssignment(BOX_2_2, starters);

    expect(plan.slotAssignments).toHaveLength(5);
    expect(plan.slotAssignments.every((row) => row.entryKey !== null)).toBe(true);
    expect(plan.unplacedKeys).toHaveLength(1);
  });

  it('아직 대기 중인(좌표 없는) 선수는 자동으로 배치되지 않는다', () => {
    // 사용자가 아무것도 선택하지 않았는데 선수가 자리에 들어가 있던 증상 방지.
    const starters = [
      entry({ key: 'gk', goalkeeper: true, positionX: 50, positionY: 6 }),
      entry({ key: 'waiting1' }),
      entry({ key: 'waiting2' }),
    ];
    const plan = planFormationAssignment(BOX_2_2, starters);

    const assignedKeys = plan.slotAssignments.map((row) => row.entryKey).filter((key) => key !== null);
    expect(assignedKeys).toEqual(['gk']);
    // 필드 슬롯 4개는 비어 있어야 한다.
    expect(plan.slotAssignments.filter((row) => row.entryKey === null)).toHaveLength(4);
    expect(plan.unplacedKeys).toEqual([]);
  });

  it('좌표가 가까운 선수가 가까운 슬롯을 받는다 (좌우가 뒤바뀌지 않는다)', () => {
    // 좌측(x=20)에 있던 이아라가 우측(x=72) 슬롯으로 건너뛰면 사용자에겐 "좌표가 튄" 것으로 보인다.
    const plan = planFormationAssignment(BOX_2_2, fullyPlacedDiamond());

    const slotOf = (key: string) => plan.slotAssignments.find((row) => row.entryKey === key)?.slot;
    expect(slotOf('alaL')?.x).toBeLessThan(50);
    expect(slotOf('alaR')?.x).toBeGreaterThan(50);
  });
});

describe('applyAssignmentToEntries', () => {
  it('배정된 선수의 좌표·포지션을 새 슬롯 값으로 갱신한다', () => {
    const starters = fullyPlacedDiamond();
    const plan = planFormationAssignment(BOX_2_2, starters);
    const next = applyAssignmentToEntries(starters, plan);

    for (const row of plan.slotAssignments) {
      if (row.entryKey === null) continue;
      const updated = next.find((item) => item.key === row.entryKey);
      expect(updated?.positionX).toBe(row.slot.x);
      expect(updated?.positionY).toBe(row.slot.y);
      if (row.slot.positionCode === 'GK') {
        // GK는 position 대신 goalkeeper 플래그로 식별하는 앱 전체 관례를 따른다.
        expect(updated?.goalkeeper).toBe(true);
        expect(updated?.position).toBeNull();
      } else {
        expect(updated?.goalkeeper).toBe(false);
        expect(updated?.position).toBe(row.slot.positionCode);
      }
    }
  });

  it('대기로 내려간 선수의 좌표를 완전히 지운다 — 화면에 없는 선수가 저장되면 안 된다', () => {
    const starters = [
      ...fullyPlacedDiamond(),
      entry({ key: 'extra', displayName: '남는선수', position: 'ALA', positionX: 10, positionY: 90 }),
    ];
    const plan = planFormationAssignment(BOX_2_2, starters);
    const next = applyAssignmentToEntries(starters, plan);

    for (const key of plan.unplacedKeys) {
      const dropped = next.find((item) => item.key === key);
      expect(dropped?.positionX).toBeNull();
      expect(dropped?.positionY).toBeNull();
      expect(dropped?.position).toBeNull();
      expect(dropped?.goalkeeper).toBe(false);
    }
  });

  it('선수를 잃지 않는다 — 입력 인원과 출력 인원이 같다', () => {
    const starters = fullyPlacedDiamond();
    const next = applyAssignmentToEntries(starters, planFormationAssignment(BOX_2_2, starters));
    expect(next).toHaveLength(starters.length);
    expect(next.map((item) => item.key).sort()).toEqual(starters.map((item) => item.key).sort());
  });

  it('원본 배열을 변형하지 않는다', () => {
    const starters = fullyPlacedDiamond();
    applyAssignmentToEntries(starters, planFormationAssignment(BOX_2_2, starters));
    expect(starters.find((item) => item.key === 'alaL')?.positionX).toBe(20);
  });
});

describe('planFormationAssignment 최적성', () => {
  /**
   * 재배치가 "전체 이동을 최소로" 한다는 계약을 완전탐색으로 검증한다. 이 성질이 깨지면
   * 그리디 시절의 결함(앞선 슬롯이 좋은 자리를 선점해 뒤쪽 선수를 반대편으로 밀어냄 =
   * 사용자에게 "좌표가 튐")이 되살아난다.
   *
   * 모든 선수의 position을 null로 두어 positionCode 일치 항이 어느 배정에서든 동일해지게
   * 만든다(배정 개수는 min(슬롯, 선수)로 고정) — 그러면 비용 비교가 순수 이동거리로
   * 결정되므로, 내부 페널티 상수를 테스트가 알 필요 없다.
   */
  function squaredDistanceSum(
    slots: FormationSlot[],
    starters: AssignableEntry[],
    plan: ReturnType<typeof planFormationAssignment>,
  ): number {
    const byKey = new Map(starters.map((item) => [item.key, item]));
    let total = 0;
    for (const { slot, entryKey } of plan.slotAssignments) {
      if (entryKey === null) continue;
      const item = byKey.get(entryKey);
      if (item === undefined) continue;
      total += (item.positionX! - slot.x) ** 2 + (item.positionY! - slot.y) ** 2;
    }
    return total;
  }

  /**
   * 완전탐색 최소 거리합. 슬롯마다 "선수를 배정" / "비워둔다" 두 갈래를 모두 밟는다 —
   * 슬롯이 선수보다 많을 때 **어느 슬롯을 비우는지**가 최적값을 좌우하므로, 앞쪽 슬롯부터
   * 무조건 채우는 탐색은 최적을 놓친다. 다만 비우기를 무제한 허용하면 전부 비우는 쪽이
   * 비용 0으로 최소가 되니, 매칭 개수를 min(슬롯, 선수)로 고정해 헝가리안과 같은 조건에서
   * 비교한다(헝가리안도 항상 가능한 최대 매칭을 만든다).
   */
  function bruteForceMinimum(slots: FormationSlot[], starters: AssignableEntry[]): number {
    const targetCount = Math.min(slots.length, starters.length);
    let best = Infinity;
    const walk = (slotIndex: number, remaining: AssignableEntry[], acc: number, assigned: number) => {
      if (acc >= best) return; // 비용이 음수가 될 수 없어 안전한 가지치기
      if (assigned === targetCount) {
        best = acc;
        return;
      }
      if (slotIndex === slots.length) return; // 목표 개수를 못 채운 조합은 무효
      walk(slotIndex + 1, remaining, acc, assigned); // 이 슬롯을 비워둔다
      const slot = slots[slotIndex];
      remaining.forEach((candidate, index) => {
        const next = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
        const distance = (candidate.positionX! - slot.x) ** 2 + (candidate.positionY! - slot.y) ** 2;
        walk(slotIndex + 1, next, acc + distance, assigned + 1);
      });
    };
    walk(0, starters, 0, 0);
    return best;
  }

  it('무작위 배치 30건 모두 완전탐색 최적값과 일치한다', () => {
    // 고정 시드 LCG — Math.random을 쓰면 실패를 재현할 수 없다.
    let seed = 20260812;
    const nextInt = (bound: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % bound;
    };

    for (let round = 0; round < 30; round += 1) {
      const slotCount = 3 + nextInt(3); // 3~5개 필드 슬롯
      const entryCount = 3 + nextInt(3); // 3~5명 배치된 필드 선수
      const slots: FormationSlot[] = Array.from({ length: slotCount }, (_unused, index) => ({
        positionCode: `SLOT${index}`,
        label: `자리${index}`,
        x: nextInt(101),
        y: nextInt(101),
      }));
      const starters: AssignableEntry[] = Array.from({ length: entryCount }, (_unused, index) =>
        entry({ key: `p${index}`, positionX: nextInt(101), positionY: nextInt(101) }),
      );

      const plan = planFormationAssignment(slots, starters);
      expect(squaredDistanceSum(slots, starters, plan)).toBe(bruteForceMinimum(slots, starters));
      // 배정 개수는 항상 min(슬롯, 선수) — 배정할 수 있는데 비워두는 일이 없어야 한다.
      const assignedCount = plan.slotAssignments.filter((row) => row.entryKey !== null).length;
      expect(assignedCount).toBe(Math.min(slotCount, entryCount));
    }
  });
});

describe('describeFormationChange', () => {
  it('대기로 내려가는 선수 이름을 정확히 보고한다 (확인 모달 문구의 근거)', () => {
    const starters = [
      ...fullyPlacedDiamond(),
      entry({ key: 'extra', displayName: '남는선수', position: 'ALA', positionX: 10, positionY: 90 }),
    ];
    const summary = describeFormationChange(BOX_2_2, starters);

    expect(summary.unplacedNames).toHaveLength(1);
    expect(summary.movedCount).toBeGreaterThan(0);
    expect(summary.emptySlotCount).toBe(0);
  });

  it('좌표가 이미 새 프리셋과 같으면 이동으로 세지 않는다', () => {
    // 1-2-1에 이미 정확히 맞춰진 상태에서 같은 1-2-1을 다시 고르면 바뀌는 게 없다.
    const summary = describeFormationChange(DIAMOND_1_2_1, fullyPlacedDiamond());

    expect(summary.movedCount).toBe(0);
    expect(summary.unplacedNames).toEqual([]);
    expect(summary.emptySlotCount).toBe(0);
  });

  it('배치된 선수가 없으면 확인할 것이 없다고 보고한다', () => {
    const summary = describeFormationChange(BOX_2_2, [entry({ key: 'w1' }), entry({ key: 'w2' })]);

    expect(summary.movedCount).toBe(0);
    expect(summary.unplacedNames).toEqual([]);
    expect(summary.emptySlotCount).toBe(5);
  });
});
