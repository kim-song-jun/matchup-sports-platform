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
 * 대회 진행 순서는 `fixtureNumber` 가 이미 갖고 있다(alpha 실측: A조 1 · B조 2 · 4강 3,4 ·
 * 결승 5 · 3·4위전 6). `scheduledAt` 으로 정렬하면 일정이 아직 안 잡혔거나 운영상 시간이
 * 뒤바뀐 대회에서 순서가 무너지므로, 그룹 순서는 **그 그룹의 가장 이른 fixtureNumber** 로
 * 정한다.
 */
export function groupScheduleEntries(entries: readonly PublicScheduleEntry[]): SchedulePhase[] {
  const phases: Array<{ key: SchedulePhaseKey; label: string; groups: Map<string, ScheduleGroup> }> = [
    { key: 'group_stage', label: '조별리그', groups: new Map() },
    { key: 'knockout', label: '결선', groups: new Map() },
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
