/**
 * 라인업 슬롯(포지션 라벨이 붙은 빈 자리) 계산기 — team-match 라인업과 대회 fixture 라인업
 * 두 화면이 이 모듈 하나를 공유한다(D-8). **순수 함수만** 갖고 어떤 포메이션·포지션
 * 데이터도 갖지 않는다(D-17) — 종목별 사전의 단일 출처는 서버
 * `V1CompetitionConfigVersion.lineup`이 라인업 응답에 실어 내려주는 `lineupConfig`다.
 * 프론트에 카탈로그를 다시 두면 T1-5가 dead code가 되고, 종목을 늘릴 때마다 이 코어를
 * 고쳐야 해 종목 확장성이 깨진다.
 *
 * 좌표는 pitch-formation-editor.tsx와 같은 좌표계(0~100%, y=0 자기 골라인 · y=100
 * 하프라인 · 낮은 y=수비/높은 y=공격)를 그대로 신뢰한다 — 이 모듈은 좌표를 계산하지
 * 않고 서버가 준 좌표를 그대로 옮겨 담기만 한다.
 *
 * 이 모듈은 앱의 LineupEntryDraft 타입을 전혀 모른다(의도적) — React 없이도 단독으로
 * 테스트할 수 있는 순수 데이터·필터 계층이다.
 */

export interface FormationSlot {
  positionCode: string;
  label: string;
  x: number;
  y: number;
}

export interface FormationPreset {
  code: string;
  label: string;
  outfield: number;
  slots: FormationSlot[];
}

/** 서버 lineupConfig.positions 행 — 포지션 코드 사전(D-7). */
export interface LineupConfigPosition {
  code: string;
  label: string;
  short: string;
  goalkeeper?: boolean;
}

/** 서버 lineupConfig.formations 행 — 슬롯 좌표는 서버(T1-5)가 이미 확정해 내려준다. */
export interface LineupConfigFormation {
  code: string;
  label: string;
  outfield: number;
  slots: Array<{ position: string; x: number; y: number }>;
}

/** 서버가 내려준 lineupConfig.positions/formations를 화면이 쓰는 FormationPreset[]로
 * 옮겨 담는다 — 계산도 데이터 발명도 없이, positions 사전으로 formations의 각 슬롯에
 * 라벨만 붙인다. positions 사전에 없는 코드가 슬롯에 나오면(서버·프론트 배포 시점이
 * 어긋나는 등 방어적 상황) 코드 자체를 라벨로 폴백해 화면이 깨지지 않게 한다. */
export function buildFormationPresets(
  positions: readonly LineupConfigPosition[],
  formations: readonly LineupConfigFormation[],
): FormationPreset[] {
  const labelByCode = new Map(positions.map((position) => [position.code, position.label]));
  return formations.map((formation) => ({
    code: formation.code,
    label: formation.label,
    outfield: formation.outfield,
    slots: formation.slots.map((slot) => ({
      positionCode: slot.position,
      label: labelByCode.get(slot.position) ?? slot.position,
      x: slot.x,
      y: slot.y,
    })),
  }));
}

/** 필드 인원수(골키퍼 제외)에 맞는 프리셋만 남긴다. 순서는 formations 배열 순서를 그대로
 * 따른다 — 화면의 칩 정렬 순서가 서버가 준 순서와 일치한다. */
export function presetsForOutfieldCount(
  presets: readonly FormationPreset[],
  outfieldCount: number,
): FormationPreset[] {
  return presets.filter((preset) => preset.outfield === outfieldCount);
}

/** 골키퍼 슬롯은 좌표가 (50,6) 고정이라 서버 프리셋 slots 배열에 담기지 않는다(현행
 * 동작 유지, T1-5) — 이 함수가 항상 앞에 붙인다. 원본 preset.slots는 건드리지 않고
 * 새 배열을 만들어 돌려준다.
 *
 * positionCode/label은 이 슬롯·라인업 편집기 내부에서만 쓰는 자리 표시(내부 마커)다 —
 * 실제로 서버에 저장되는 골키퍼 포지션 값은 이 값이 아니라 buildSavePayload가 별도로
 * (goalkeeperPositionCode를 통해) 종목 사전에서 읽어 채운다(D-17, [알파 감사 E]). 그래서
 * 여기 쓰는 GOALKEEPER_SLOT_CODE는 종목이 늘어나도 안전하다 — 화면 안에서 "이 슬롯이
 * 골키퍼 자리다"를 구분하는 용도일 뿐, 축구/풋살 어느 쪽이든 같은 내부 마커를 공유해도 된다. */
export function slotsWithGoalkeeper(preset: FormationPreset): FormationSlot[] {
  return [{ positionCode: GOALKEEPER_SLOT_CODE, label: 'GK', x: 50, y: 6 }, ...preset.slots];
}

/** 골키퍼 슬롯을 가리키는 **화면 내부 마커**. 서버에 저장되는 실제 포지션 코드가 아니다
 * (그건 goalkeeperPositionCode가 종목 사전에서 읽는다 — 축구 'GK', 풋살 'GOLEIRO').
 * slotsWithGoalkeeper가 붙이는 값과 그 슬롯을 판별하는 쪽(formation-assignment.ts,
 * matchSlotsToEntries)이 같은 상수를 봐야 한다 — 예전에는 양쪽이 'GK' 문자열을 각자
 * 하드코딩해 한쪽만 바꾸면 조용히 어긋날 수 있었다. */
export const GOALKEEPER_SLOT_CODE = 'GK';

/** [알파 감사 E] positions 사전에서 실제 골키퍼 포지션 코드를 찾는다 — 축구는 'GK',
 * 풋살은 'GOLEIRO'로 서로 다르다. 저장(buildSavePayload)·재수화(hydrateFixtureLineupState)
 * 양쪽 모두 이 값을 써야 대회 fixture 라인업이 종목과 무관하게 'GK' 문자열로
 * 하드코딩되지 않는다. positions 사전에 goalkeeper:true 항목이 없으면(방어적 상황 —
 * 사전 파싱 실패 등) 기존 동작과 동일하게 'GK'로 폴백한다. */
export function goalkeeperPositionCode(positions: readonly LineupConfigPosition[]): string {
  return positions.find((position) => position.goalkeeper === true)?.code ?? 'GK';
}
