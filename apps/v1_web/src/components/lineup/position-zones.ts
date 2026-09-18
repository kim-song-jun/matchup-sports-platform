/**
 * [D14] 선호 포지션을 고르기 위한 **코트 위 띠(zone) 배치**.
 *
 * ## 이건 경기 대형이 아니다
 * `competition-config.presets.ts` 의 `FOOTBALL_FORMATIONS` 는 **의도적으로 빈 배열**이고
 * 그 주석이 이유를 못박고 있다 — *"축구 11인제 포메이션 좌표는 설계 문서 어디에도 없다.
 * 없는 데이터를 창작하지 않고 빈 배열로 둔다"*.
 *
 * 여기서 만드는 띠는 그 거부 대상이 **아니다.** 경기 규칙으로서의 대형 좌표가 아니라,
 * **프로필 화면에서 자기 자리를 고르기 위한 UI 영역**이다. 둘을 섞지 않기 위해 경계를
 * 코드로 지킨다:
 *
 * - 이 파일은 `apps/v1_web` 안에만 있다. **좌표가 API·DB·competition-config 로 나가지
 *   않는다.** 서버가 주는 것은 여전히 `positions` 의 코드·라벨·`goalkeeper` 플래그뿐이다.
 * - 띠 순서를 **여기에 다시 적지 않는다.** 프리셋의 `positions` 배열 순서와 `goalkeeper`
 *   플래그에서 파생한다 — 순서를 두 곳에 적으면 프리셋이 바뀔 때 화면이 조용히 어긋난다.
 *
 * ## 언제 띠를 쓰나
 * 그 종목에 **대형 좌표가 없을 때**만이다(`formations` 가 빈 배열). 종목 이름으로 가르지
 * 않는다 — 나중에 축구 대형이 실제로 들어오면 **이 파일을 고치지 않아도** 대형 방식으로
 * 전환된다.
 */

export interface PositionOption {
  readonly code: string;
  readonly label: string;
  readonly goalkeeper?: boolean;
}

export interface PositionZone {
  readonly code: string;
  readonly label: string;
  readonly goalkeeper: boolean;
  /**
   * 위에서부터 0, 1, 2… 순서. **0 이 화면 위쪽(공격)** 이고 마지막이 아래쪽(자기 골문)이다.
   * 실제 픽셀 위치는 이 순서와 총 개수로 컴포넌트가 계산한다 — 좌표를 여기 두지 않는다.
   */
  readonly rowIndex: number;
}

/**
 * 자리 목록을 **띠 순서로** 배열한다.
 *
 * 규칙 둘뿐이다:
 * 1. **골키퍼는 항상 맨 아래**(자기 골문 쪽). 프리셋에서 `goalkeeper: true` 인 항목이다.
 * 2. 나머지는 **프리셋 배열 순서를 뒤집어** 위로 쌓는다. 프리셋은 뒤(수비)에서 앞(공격)
 *    순으로 적혀 있고(축구 `GK → DF → MF → FW`), 화면은 위가 공격이라 방향이 반대다.
 *
 * 골키퍼가 없는 종목도 정상이다 — 그때는 2번만 적용된다.
 */
export function buildPositionZones(positions: readonly PositionOption[]): PositionZone[] {
  const keepers = positions.filter((position) => position.goalkeeper === true);
  const outfield = positions.filter((position) => position.goalkeeper !== true);

  // 화면 위 = 공격. 프리셋은 뒤에서 앞 순서이므로 뒤집는다.
  const ordered = [...outfield].reverse();

  return [...ordered, ...keepers].map((position, index) => ({
    code: position.code,
    label: position.label,
    goalkeeper: position.goalkeeper === true,
    rowIndex: index,
  }));
}

/**
 * 이 종목을 **띠로 그릴지 대형 좌표로 그릴지**. 종목 이름이 아니라 데이터로 가른다.
 *
 * 대형이 하나라도 있으면 그 좌표를 쓴다(풋살). 비어 있으면 띠다(현재 축구). 나중에 축구
 * 대형이 프리셋에 들어오면 이 함수가 저절로 `false` 를 돌려주고 화면이 대형으로 바뀐다 —
 * **코드 수정이 필요 없다.**
 */
export function shouldUseZoneLayout(formations: readonly unknown[]): boolean {
  return formations.length === 0;
}

/** 대형의 한 자리. 좌표는 앱 기준(y=0 우리 골라인, y=100 상대 골라인). */
export interface FormationSlot {
  readonly position: string;
  readonly x: number;
  readonly y: number;
}

export interface FormationOption {
  readonly slots?: readonly FormationSlot[];
}

/**
 * 대형 좌표가 있는 종목(풋살)에서 **자리별 대표 위치**를 뽑는다.
 *
 * 대형은 **슬롯** 목록이라 같은 자리가 여러 번 나온다(풋살 다이아몬드에 `ALA` 가 좌우
 * 둘). 그런데 여기서 고르는 것은 **자리(코드)** 이지 슬롯이 아니다 — `ALA` 버튼이 둘이면
 * "왼쪽 알라와 오른쪽 알라 중 뭘 고르라는 거지?"가 된다. 그래서 같은 코드의 슬롯을
 * **평균**해 하나로 합친다. 좌표를 지어내는 것이 아니라 프리셋 값에서 파생한다.
 *
 * 대형에 없는 자리(골키퍼는 outfield 슬롯에 안 들어간다)는 `null` 로 남기고, 호출부가
 * 맨 아래(우리 골문)에 놓는다.
 */
export function averageSlotPositions(
  formations: readonly FormationOption[],
): Map<string, { x: number; y: number }> {
  const first = formations[0];
  const result = new Map<string, { x: number; y: number }>();
  if (first === undefined || first.slots === undefined) return result;

  const buckets = new Map<string, { x: number; y: number; n: number }>();
  for (const slot of first.slots) {
    const bucket = buckets.get(slot.position) ?? { x: 0, y: 0, n: 0 };
    bucket.x += slot.x;
    bucket.y += slot.y;
    bucket.n += 1;
    buckets.set(slot.position, bucket);
  }
  for (const [code, bucket] of buckets) {
    result.set(code, { x: bucket.x / bucket.n, y: bucket.y / bucket.n });
  }
  return result;
}
