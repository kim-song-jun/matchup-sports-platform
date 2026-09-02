import type { PublicScheduleEntry } from './types';

/**
 * 경기 일정을 **단계 → 조/라운드** 두 겹으로 묶는다. 예전에는 서버가 준 순서 그대로
 * 한 줄로 흘려보냈고, 데스크톱에서 두 열로 펴자 A조·B조·결승·4강이 좌우로 뒤섞여
 * 읽히는 순서가 사라졌다(오너 지적: "이거 두개로 바뀐거 좀 구린 거 같은데").
 *
 * 묶는 기준을 `groupId` 로 삼을 수 없다 — 실측(alpha)에서 결승·4강·3위 결정전도 각자
 * `groupId` 를 갖고 있어 조별리그와 구분되지 않는다. 대신 라운드 이름을 본다.
 */
export type SchedulePhaseKey = 'group_stage' | 'knockout';

export type ScheduleGroup = {
  key: string;
  label: string;
  entries: PublicScheduleEntry[];
};

export type SchedulePhase = {
  key: SchedulePhaseKey;
  label: string;
  groups: ScheduleGroup[];
};

/**
 * 단계 이름은 **표면마다 다르다.** 예전엔 상수로 박혀 있었는데, 정규 리그가 이 화면을 쓰기
 * 시작하면서 문제가 드러났다 — 리그 대진은 `round` 가 'N주차' 라 `isGroupStage` 가 false 가
 * 되어 **전부 `결선` 으로 분류되고**, 그 이름이 필터 칩과 `section aria-label` 로 **보인다.**
 * 리그에 결선이라는 단계는 없다.
 *
 * 그래서 이름만 표면별로 갈아 끼운다 — 분류 규칙(무엇이 어느 단계인가)은 그대로다.
 */
export type SchedulePhaseLabels = Readonly<Record<SchedulePhaseKey, string>>;

export const TOURNAMENT_PHASE_LABELS: SchedulePhaseLabels = {
  group_stage: '조별리그',
  knockout: '결선',
};

/**
 * 정규 리그의 단계 이름(2026-09-01 사용자 확정 — "'결선' 대신 '정규 라운드'로 부르고 칩
 * 구조는 유지").
 *
 * ⚠️ `group_stage` 는 **현재 리그에서 도달하지 않는다** — 서버가 리그 `round` 를 'N주차' 로
 * 주고 `groupName` 을 비우므로 `isGroupStage` 가 항상 false 다. 그래도 리그 어휘로 적어
 * 둔다: 조 편성이 있는 리그가 생겨 도달하는 날 '조별리그' 라는 대회 말이 튀어나오면
 * 그때는 원인을 찾기 어렵다.
 */
export const LEAGUE_PHASE_LABELS: SchedulePhaseLabels = {
  group_stage: '조별 라운드',
  knockout: '정규 라운드',
};

/**
 * 조별리그인가. `round` 가 "조별"로 시작하는 게 1차 신호이고, 그게 비어 있는 과거
 * 데이터를 위해 `groupName` 이 "조"로 끝나는지도 함께 본다("A조"/"B조").
 * "3위 결정전"처럼 조가 아닌 이름은 두 조건 모두 걸리지 않는다.
 */
function isGroupStage(entry: PublicScheduleEntry): boolean {
  if (entry.round.startsWith('조별')) return true;
  const name = entry.groupName?.trim() ?? '';
  return name.endsWith('조');
}

/** 같은 라벨끼리 묶을 때 쓰는 키 — 이름이 없으면 라운드로 떨어진다(빈 제목을 만들지 않는다). */
function groupLabelOf(entry: PublicScheduleEntry): string {
  const name = entry.groupName?.trim();
  return name !== undefined && name !== '' ? name : entry.round;
}

/**
 * F4 fix: 이 항목이 속한 단계 키(조별리그/결선). `groupScheduleEntries`가 일정이 잡힌
 * 목록을 두 단계로 나눌 때 쓰는 것과 같은 분류 로직을 "시간 미정 경기" 섹션에도 그대로
 * 적용할 수 있도록 노출한다 — 필터 칩(조별리그/결선)이 예전엔 일정이 잡힌 목록에만
 * 걸리고 시간 미정 목록은 항상 전체가 보였다.
 */
export function phaseKeyOf(entry: PublicScheduleEntry): SchedulePhaseKey {
  return isGroupStage(entry) ? 'group_stage' : 'knockout';
}

/**
 * 대회 진행 순서는 `fixtureNumber` 가 이미 갖고 있다(alpha 실측: A조 1 · B조 2 · 4강 3,4 ·
 * 결승 5 · 3·4위전 6). `scheduledAt` 으로 정렬하면 일정이 아직 안 잡혔거나 운영상 시간이
 * 뒤바뀐 대회에서 순서가 무너지므로, 그룹 순서는 **그 그룹의 가장 이른 fixtureNumber** 로
 * 정한다.
 */
export function groupScheduleEntries(
  entries: readonly PublicScheduleEntry[],
  phaseLabels: SchedulePhaseLabels = TOURNAMENT_PHASE_LABELS,
): SchedulePhase[] {
  const phases: Array<{ key: SchedulePhaseKey; label: string; groups: Map<string, ScheduleGroup> }> = [
    { key: 'group_stage', label: phaseLabels.group_stage, groups: new Map() },
    { key: 'knockout', label: phaseLabels.knockout, groups: new Map() },
  ];

  for (const entry of entries) {
    const phase = phases[isGroupStage(entry) ? 0 : 1];
    const label = groupLabelOf(entry);
    const existing = phase.groups.get(label);
    if (existing === undefined) {
      phase.groups.set(label, { key: label, label, entries: [entry] });
    } else {
      existing.entries.push(entry);
    }
  }

  const orderOf = (list: readonly PublicScheduleEntry[]) =>
    Math.min(...list.map((entry) => entry.fixtureNumber));

  return phases
    .map((phase) => ({
      key: phase.key,
      label: phase.label,
      groups: [...phase.groups.values()]
        .map((group) => ({
          ...group,
          entries: [...group.entries].sort((a, b) => a.fixtureNumber - b.fixtureNumber),
        }))
        .sort((a, b) => orderOf(a.entries) - orderOf(b.entries)),
    }))
    // 조별리그가 없는 순수 토너먼트, 결선이 아직 없는 리그 — 빈 단계는 제목만 남으므로 지운다.
    .filter((phase) => phase.groups.length > 0);
}

/**
 * "시간 미정 경기" 목록을 같은 조·라운드끼리 묶는다.
 *
 * 이 목록은 예전에 한 줄로 흘려보냈다 — 그래서 같은 조(또는 라운드)의 경기가 여러 개면
 * 카드마다 `A조`·`4강` 이 그대로 반복돼 나왔다(오너 지적: "조도 중복되고"). 일정이 잡힌
 * 목록은 이미 제목 한 번 + 카드에서 라벨 생략으로 처리하고 있으므로, 여기도 같은 모양으로
 * 맞춘다. 단계(조별/결선)까지 나누지는 않는다 — 시간 미정 목록은 보통 몇 건뿐이라
 * 두 겹으로 접으면 제목만 늘어난다.
 */
export function groupUnscheduledEntries(entries: readonly PublicScheduleEntry[]): ScheduleGroup[] {
  const byLabel = new Map<string, ScheduleGroup>();
  for (const entry of entries) {
    const label = groupLabelOf(entry);
    const existing = byLabel.get(label);
    if (existing === undefined) byLabel.set(label, { key: label, label, entries: [entry] });
    else existing.entries.push(entry);
  }
  return [...byLabel.values()].map((group) => ({
    ...group,
    entries: [...group.entries].sort((a, b) => a.fixtureNumber - b.fixtureNumber),
  }));
}

/** 필터 칩 하나. `key` 가 null 이면 "전체". */
export type ScheduleFilter = { key: string; label: string };

/**
 * 지금 일정에 실제로 존재하는 것만 칩으로 만든다 — 고를 게 없는 칩(경기가 하나도 없는
 * 단계, 내 경기가 없는데 "내 팀")을 띄우면 눌러도 빈 화면만 나온다.
 */
export function buildScheduleFilters(phases: SchedulePhase[], hasMyFixtures: boolean): ScheduleFilter[] {
  const filters: ScheduleFilter[] = [{ key: 'all', label: '전체' }];
  if (hasMyFixtures) filters.push({ key: 'mine', label: '내 팀' });
  for (const phase of phases) filters.push({ key: phase.key, label: phase.label });
  return filters;
}
