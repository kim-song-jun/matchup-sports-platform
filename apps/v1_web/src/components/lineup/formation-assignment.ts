import { GOALKEEPER_SLOT_CODE, type FormationSlot } from './formation-slots';

/**
 * 포메이션 프리셋을 바꿀 때 "이미 배치된 선수를 새 슬롯으로 어떻게 옮기는가"를 계산하는
 * 순수 모듈. team-match 라인업과 대회 fixture 라인업이 이 모듈 하나를 공유한다 — 두
 * 화면의 상태 타입(baseRevision vs gameVersion)은 다르지만 선발 엔트리 형태는 같아서,
 * 재배치 규칙을 두 번 구현하면 반드시 어긋난다.
 *
 * ## 왜 필요한가 (2026-08 사용자 제보 결함)
 *
 * 예전에는 프리셋을 바꿔도 각 선수의 positionX/Y·position을 그대로 뒀고, 슬롯↔선수
 * 짝짓기는 `matchSlotsToEntries`가 **positionCode 완전일치**로만 했다. 그래서 새 프리셋에
 * 그 코드 슬롯이 없거나 개수가 줄면(1-2-1의 ALA 2명 → 2-2에는 ALA 슬롯이 0개) 그 선수는
 * 매칭에서 탈락했고, 슬롯 모드 렌더는 매칭된 선수만 그리므로 **피치에서 조용히 사라졌다**.
 * 좌표는 남아 있어 저장 페이로드에는 옛 좌표가 그대로 실렸다 — 화면엔 없는 선수가 DB에는
 * 저장되는 불일치까지 함께 생겼다.
 *
 * ## 배정 규칙
 *
 * 1. **골키퍼는 GK 슬롯에만.** `goalkeeper` 플래그가 이 앱 전체의 GK 식별 방식이므로
 *    필드 슬롯 경쟁에 아예 참여시키지 않는다.
 * 2. **이미 피치에 있는 선수만 옮긴다.** 좌표가 없는(대기 중) 선수를 자동으로 빈 자리에
 *    끼워 넣지 않는다 — "아무것도 선택하지 않았는데 선수가 들어가 있다"는 제보가 바로
 *    그 자동 채우기를 오해로 만든 원인이었다. 빈 자리는 사용자가 탭해서 채운다.
 * 3. **전체 이동 거리를 최소로 하는 배정**을 고른다(최소 비용 이분 매칭). 슬롯마다
 *    가장 가까운 선수를 차례로 집는 그리디는 앞선 슬롯이 좋은 자리를 선점해 뒤쪽 선수를
 *    반대편으로 밀어내고, 사용자에게는 그게 "좌표가 튀는" 것으로 보인다. 실제 사례:
 *    1-2-1 → 2-2 전환에서 좌측 아라가 우측 자리로 건너뛰었다.
 * 4. **같은 positionCode를 유지하는 배정을 압도적으로 우선**한다(아래 상수 참고) —
 *    픽소였던 선수가 피보 자리로 가는 것보다 픽소 자리를 지키는 쪽이 사용자 기대에 맞다.
 * 5. 자리를 못 받은 선수는 대기로 내려가고 **좌표·포지션·GK 지정까지 완전히 지운다**
 *    (유령 좌표가 저장되지 않도록).
 */

/** 재배치에 필요한 최소 필드만 요구한다 — `LineupEntryDraft`가 이 형태를 만족하므로
 * 두 화면의 뷰모델이 자기 타입을 그대로 넘길 수 있고, 이 모듈은 앱 타입을 몰라도 된다. */
export interface AssignableEntry {
  key: string;
  displayName: string;
  goalkeeper: boolean;
  position: string | null;
  positionX: number | null;
  positionY: number | null;
}

export interface FormationAssignmentPlan {
  /** 입력 slots 순서를 그대로 유지한다. `entryKey`가 null이면 빈 자리. */
  slotAssignments: Array<{ slot: FormationSlot; entryKey: string | null }>;
  /** 자리를 받지 못해 대기로 내려가는 선수 key — 원래 대기였던 선수는 포함하지 않는다. */
  unplacedKeys: string[];
}

export interface FormationChangeSummary {
  /** 좌표가 실제로 달라지는 선수 수(같은 자리에 그대로 남는 선수는 세지 않는다). */
  movedCount: number;
  /** 대기로 내려가는 선수 이름 — 확인 모달이 그대로 읽어 보여준다. */
  unplacedNames: string[];
  /** 전환 후에도 비어 있는 자리 수. */
  emptySlotCount: number;
}

/**
 * positionCode 불일치에 매기는 비용. 좌표는 0~100 퍼센트라 거리 제곱의 최대값이
 * 100² + 100² = 20,000이다 — 페널티를 그보다 훨씬 크게 두면 "코드 일치 개수를 최대로
 * 만드는 배정"이 항상 먼저 선택되고, 같은 개수의 배정끼리는 거리로 갈린다.
 */
const POSITION_CODE_MISMATCH_COST = 1_000_000;

function isPlaced(entry: AssignableEntry): boolean {
  return entry.positionX !== null && entry.positionY !== null;
}

/** 슬롯↔선수 배정 계획을 만든다. 상태를 바꾸지 않는 순수 계산 — 확인 모달이 미리보기로,
 * 확정 시 applyAssignmentToEntries가 실제 적용으로 같은 계획을 재사용한다. */
export function planFormationAssignment(
  slots: readonly FormationSlot[],
  starters: readonly AssignableEntry[],
): FormationAssignmentPlan {
  const assignedKeyBySlotIndex = new Array<string | null>(slots.length).fill(null);
  const placed = starters.filter(isPlaced);
  const assignedKeys = new Set<string>();

  // 1) 골키퍼 — GK 슬롯에만 들어간다. 슬롯이 여러 개인 프리셋은 없지만(slotsWithGoalkeeper가
  //    항상 하나만 앞에 붙인다) 방어적으로 첫 GK 슬롯만 쓴다.
  const goalkeeperSlotIndex = slots.findIndex((slot) => slot.positionCode === GOALKEEPER_SLOT_CODE);
  const goalkeeper = placed.find((entry) => entry.goalkeeper);
  if (goalkeeperSlotIndex !== -1 && goalkeeper !== undefined) {
    assignedKeyBySlotIndex[goalkeeperSlotIndex] = goalkeeper.key;
    assignedKeys.add(goalkeeper.key);
  }

  // 2) 필드 선수 ↔ 필드 슬롯 최소 비용 매칭.
  const fieldSlotIndexes = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.positionCode !== GOALKEEPER_SLOT_CODE);
  const fieldEntries = placed.filter((entry) => !entry.goalkeeper && !assignedKeys.has(entry.key));

  if (fieldSlotIndexes.length > 0 && fieldEntries.length > 0) {
    const cost = fieldEntries.map((entry) =>
      fieldSlotIndexes.map(({ slot }) => {
        const dx = (entry.positionX as number) - slot.x;
        const dy = (entry.positionY as number) - slot.y;
        const mismatch = entry.position === slot.positionCode ? 0 : POSITION_CODE_MISMATCH_COST;
        return mismatch + dx * dx + dy * dy;
      }),
    );
    const assignment = minCostMatching(cost);
    assignment.forEach((columnIndex, rowIndex) => {
      if (columnIndex === -1) return;
      const entry = fieldEntries[rowIndex];
      assignedKeyBySlotIndex[fieldSlotIndexes[columnIndex].index] = entry.key;
      assignedKeys.add(entry.key);
    });
  }

  return {
    slotAssignments: slots.map((slot, index) => ({ slot, entryKey: assignedKeyBySlotIndex[index] })),
    unplacedKeys: placed.filter((entry) => !assignedKeys.has(entry.key)).map((entry) => entry.key),
  };
}

/**
 * 계획을 실제 엔트리 배열에 적용한다. 입력 배열·엔트리를 변형하지 않고 새 객체를 돌려주며,
 * 인원과 순서는 그대로 유지한다(선수를 잃지 않는다는 이 모듈의 핵심 계약).
 *
 * 배정된 선수는 슬롯의 좌표·포지션을 그대로 받는다 — GK 슬롯이면 `position`은 null로 두고
 * `goalkeeper` 플래그를 켠다. 이 앱은 골키퍼를 position 코드가 아니라 플래그로 식별하고
 * 저장 시점에 종목 사전에서 실제 코드를 채우기 때문이다(`goalkeeperPositionCode`).
 */
export function applyAssignmentToEntries<T extends AssignableEntry>(
  starters: readonly T[],
  plan: FormationAssignmentPlan,
): T[] {
  const slotByEntryKey = new Map<string, FormationSlot>();
  for (const { slot, entryKey } of plan.slotAssignments) {
    if (entryKey !== null) slotByEntryKey.set(entryKey, slot);
  }
  const unplacedKeys = new Set(plan.unplacedKeys);

  return starters.map((entry) => {
    const slot = slotByEntryKey.get(entry.key);
    if (slot !== undefined) {
      const isGoalkeeperSlot = slot.positionCode === GOALKEEPER_SLOT_CODE;
      return {
        ...entry,
        positionX: slot.x,
        positionY: slot.y,
        position: isGoalkeeperSlot ? null : slot.positionCode,
        goalkeeper: isGoalkeeperSlot,
      };
    }
    if (unplacedKeys.has(entry.key)) {
      return { ...entry, positionX: null, positionY: null, position: null, goalkeeper: false };
    }
    return entry;
  });
}

/** 확인 모달이 "무엇이 바뀌는지"를 사용자에게 보여주기 위한 요약. planFormationAssignment와
 * 같은 계획을 쓰므로 모달에 쓴 문구와 실제 적용 결과가 어긋날 수 없다. */
export function describeFormationChange(
  slots: readonly FormationSlot[],
  starters: readonly AssignableEntry[],
): FormationChangeSummary {
  const plan = planFormationAssignment(slots, starters);
  const entryByKey = new Map(starters.map((entry) => [entry.key, entry]));

  let movedCount = 0;
  for (const { slot, entryKey } of plan.slotAssignments) {
    if (entryKey === null) continue;
    const entry = entryByKey.get(entryKey);
    if (entry === undefined) continue;
    if (entry.positionX !== slot.x || entry.positionY !== slot.y) movedCount += 1;
  }

  return {
    movedCount,
    unplacedNames: plan.unplacedKeys.map((key) => entryByKey.get(key)?.displayName ?? key),
    emptySlotCount: plan.slotAssignments.filter((row) => row.entryKey === null).length,
  };
}

/**
 * 최소 비용 이분 매칭(헝가리안 / Jonker-Volgenant, O(n³)).
 *
 * `cost[r][c]` = 행 r을 열 c에 붙이는 비용. 반환값 `assignment[r]`은 그 행이 받은 열
 * 인덱스이며, 행이 열보다 많으면 남는 행은 -1이다. 슬롯 수는 종목 규칙이 정하므로
 * (풋살 4~5, 축구 10) n은 항상 작고 O(n³)는 전환 한 번에 무해하다.
 *
 * 그리디가 아니라 전역 최적을 쓰는 이유는 이 파일 상단 규칙 3에 적어 두었다. 정확성은
 * formation-assignment.test.ts가 무작위 케이스를 완전탐색 최적값과 대조해 검증한다.
 */
function minCostMatching(cost: readonly number[][]): number[] {
  const rows = cost.length;
  const cols = rows > 0 ? cost[0].length : 0;
  if (rows === 0 || cols === 0) return new Array<number>(rows).fill(-1);

  // 이 알고리즘은 행 수 ≤ 열 수를 전제한다 — 선수가 슬롯보다 많으면 전치해서 풀고
  // 결과를 되돌린다(그때 자리를 못 받는 선수가 -1로 남는다).
  if (rows > cols) {
    const transposed = Array.from({ length: cols }, (_unused, c) =>
      Array.from({ length: rows }, (_unused2, r) => cost[r][c]),
    );
    const rowByColumn = minCostMatching(transposed);
    const result = new Array<number>(rows).fill(-1);
    rowByColumn.forEach((rowIndex, columnIndex) => {
      if (rowIndex !== -1) result[rowIndex] = columnIndex;
    });
    return result;
  }

  const n = rows;
  const m = cols;
  // 1-based 인덱스를 쓰는 표준 구현 형태를 그대로 따른다(인덱스 0은 가상 시작점).
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const rowByColumn = new Array<number>(m + 1).fill(0);
  const previousColumn = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    rowByColumn[0] = i;
    let currentColumn = 0;
    const minCostToColumn = new Array<number>(m + 1).fill(Infinity);
    const visited = new Array<boolean>(m + 1).fill(false);

    do {
      visited[currentColumn] = true;
      const currentRow = rowByColumn[currentColumn];
      let delta = Infinity;
      let nextColumn = 0;
      for (let j = 1; j <= m; j += 1) {
        if (visited[j]) continue;
        const reduced = cost[currentRow - 1][j - 1] - u[currentRow] - v[j];
        if (reduced < minCostToColumn[j]) {
          minCostToColumn[j] = reduced;
          previousColumn[j] = currentColumn;
        }
        if (minCostToColumn[j] < delta) {
          delta = minCostToColumn[j];
          nextColumn = j;
        }
      }
      for (let j = 0; j <= m; j += 1) {
        if (visited[j]) {
          u[rowByColumn[j]] += delta;
          v[j] -= delta;
        } else {
          minCostToColumn[j] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (rowByColumn[currentColumn] !== 0);

    // 증가 경로를 따라 매칭을 되짚어 갱신한다.
    do {
      const previous = previousColumn[currentColumn];
      rowByColumn[currentColumn] = rowByColumn[previous];
      currentColumn = previous;
    } while (currentColumn !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j += 1) {
    if (rowByColumn[j] !== 0) assignment[rowByColumn[j] - 1] = j - 1;
  }
  return assignment;
}
