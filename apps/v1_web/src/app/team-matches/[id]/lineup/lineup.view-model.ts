import { randomUuid } from '@/lib/uuid';
import type {
  V1TeamMatchLineup,
  V1TeamMatchLineupParticipantInput,
  V1TeamMatchLineupState,
} from '@/types/api';

/**
 * 라인업 편집기의 순수 상태/리듀서 모듈. 네트워크·React 없이 단독으로 테스트 가능하도록
 * 분리했다(V15 QA: "Vitest reducer/view-model tests"). 컴포넌트는 이 함수들만 호출하고
 * 직접 배열을 뒤섞지 않는다 — 중복 배치 방지·CAS 토큰 관리가 전부 여기 모여 있어야
 * 컴포넌트가 실수로 규칙을 깨뜨릴 수 없다.
 *
 * 포메이션(formation) 입력은 이 편집기에 없다 — `V1GameLineup`에 이를 저장할 컬럼이 없고
 * (Task 14 스키마), 이번 변경 범위에서는 마이그레이션을 추가할 수 없어(hard constraint)
 * 저장도 되지 않는데 입력만 받는 "눈속임 필드"를 만들지 않기 위해 DTO·타입·UI에서 전부
 * 제거했다. 저장하려면 별도 태스크로 `V1GameLineup.formation` 컬럼을 추가하는 마이그레이션이
 * 필요하다(Task 15 blocker-2 report 참고).
 */

export type RosterOption = {
  userId: string;
  displayName: string;
  role: 'owner' | 'manager' | 'member';
};

/**
 * `GET .../lineup`은 어느 팀 소속인지(teamId)를 돌려주지 않는다 — 오직 side/role만 준다.
 * 로스터 풀(추가 가능한 팀원 목록)을 가져오려면 어느 팀의 `/teams/:teamId/members`를 불러야
 * 하는지 알아야 하는데, 그 판단은 team-match-lineup.service.ts의 loadContext()와 완전히
 * 동일한 방식으로 여기서 재현한다: 이 매치의 호스트팀/승인된 상대팀 중 내가 owner·manager로
 * 속한 쪽이 "내 팀"이다.
 */
export function resolveOwnTeamId(
  teamMatch: { hostTeamId?: string; approvedOpponentTeam?: { teamId: string } | null } | undefined,
  myTeams: Array<{ teamId: string; role: 'owner' | 'manager' | 'member' }> | undefined,
): string | null {
  if (!teamMatch || !myTeams) return null;
  const candidateTeamIds = [teamMatch.hostTeamId, teamMatch.approvedOpponentTeam?.teamId].filter(
    (id): id is string => Boolean(id),
  );
  const match = myTeams.find(
    (team) => candidateTeamIds.includes(team.teamId) && (team.role === 'owner' || team.role === 'manager'),
  );
  return match?.teamId ?? null;
}

/** 편집기 안에서 다루는 한 명분 엔트리. `userId`가 없으면 비연동 게스트(D-03) —
 * 개인 기록에는 반영되지 않고 팀 집계에만 잡히는 스냅샷이다. */
export type LineupEntryDraft = {
  /** React key + 중복 배치 판정용 안정적 로컬 식별자. userId와는 별개다 — 저장된 라인업을
   * GET으로 다시 불러오면 서버가 userId를 되돌려주지 않기 때문에(참가자 스냅샷은
   * displayName만 보관, Task 14 계약) 재수화된 엔트리는 key만 있고 userId는 null이다. */
  key: string;
  userId: string | null;
  displayName: string;
  jerseyNumber: number | null;
  goalkeeper: boolean;
};

export type LineupEditorState = {
  starters: LineupEntryDraft[];
  bench: LineupEntryDraft[];
  /** 다음 저장/제출에 실어 보낼 expectedVersion(=서버의 lineup revision). */
  baseRevision: number;
  /** 마지막으로 서버에 반영된(ack된) 상태와 로컬 상태가 다른지 — true일 때만 자동저장을 예약한다. */
  dirty: boolean;
};

export type LineupCounts = {
  starterCount: number;
  benchCount: number;
  /** 로스터 중 아직 선발·후보 어디에도 배치되지 않은 인원 수. */
  waitingCount: number;
  totalRoster: number;
};

function makeEntry(input: {
  userId?: string | null;
  displayName: string;
  jerseyNumber?: number | null;
  goalkeeper?: boolean;
}): LineupEntryDraft {
  return {
    key: randomUuid(),
    userId: input.userId ?? null,
    displayName: input.displayName,
    jerseyNumber: input.jerseyNumber ?? null,
    goalkeeper: input.goalkeeper ?? false,
  };
}

export function createEmptyLineupEditorState(baseRevision: number): LineupEditorState {
  return { starters: [], bench: [], baseRevision, dirty: false };
}

/** GET 응답으로부터 편집기 상태를 새로 만든다 — 페이지 최초 진입, 그리고 버전 충돌 시
 * "새로고침" 액션(applyVersionConflictReload) 둘 다 이 함수를 거친다. 서버가 돌려주는
 * starters/bench는 displayName 스냅샷뿐이라 userId는 전부 null로 재수화된다(위 LineupEntryDraft
 * 주석 참고) — 그래서 그대로 재저장하면 링크가 사라지는 게 아니라,애초에 저장 시점에
 * 링크 여부를 다시 선택해야 하는 게 이 계약의 정직한 동작이다.
 */
export function hydrateLineupEditorState(lineup: V1TeamMatchLineup): LineupEditorState {
  return {
    starters: lineup.starters.map((starter) =>
      makeEntry({
        displayName: starter.displayName,
        jerseyNumber: starter.jerseyNumber,
        goalkeeper: starter.goalkeeper,
      }),
    ),
    bench: lineup.bench.map((entry) => makeEntry({ displayName: entry.displayName, jerseyNumber: entry.jerseyNumber })),
    baseRevision: lineup.revision,
    dirty: false,
  };
}

/** 엔트리 하나가 이 로스터 멤버를 가리키는지 판정한다.
 *
 * - `entry.userId`가 있으면(이번 세션에서 방금 추가한 엔트리) userId를 그대로 비교한다 —
 *   가장 정확한 신호.
 * - `entry.userId`가 null이면(서버에서 막 재수화된 엔트리 — GET은 displayName 스냅샷만
 *   돌려주고 userId를 절대 echo하지 않는다, Task 14 계약) 유일하게 남은 신호인 displayName
 *   완전 일치로 대체한다. 이게 없으면 페이지를 새로 열 때마다(또는 409 "새로고침" 후)
 *   이미 배치된 팀원이 다시 "추가 가능"으로 보여서 같은 사람이 두 번 배치될 수 있었다
 *   (Task 15 blocker-1) — DB에 userId를 저장하려면 `V1GameParticipant`에 컬럼을 추가하는
 *   마이그레이션이 필요한데 이번 변경 범위에서는 마이그레이션을 추가할 수 없어(hard
 *   constraint) 프론트가 이미 갖고 있는 로스터 정보로 정체성을 최대한 복구하는 쪽을 택했다.
 *   한계: 같은 팀 로스터 안에 표시 이름이 완전히 같은 서로 다른 두 사람이 있으면(또는
 *   재수화 시점 이후 별명을 바꾼 경우) 이 휴리스틱은 둘을 구분하지 못하고 보수적으로
 *   "이미 배치됨"으로 묶는다 — 실제로 다른 사람을 추가하지 못하게 막는 오탐이 생길 수
 *   있지만, 이 코드가 고치는 결함(같은 사람이 중복 등록되는 것)보다는 안전한 방향이다.
 */
function matchesRosterMember(entry: LineupEntryDraft, member: RosterOption): boolean {
  if (entry.userId !== null) return entry.userId === member.userId;
  return entry.displayName === member.displayName;
}

function isPlaced(state: LineupEditorState, member: RosterOption): boolean {
  return (
    state.starters.some((entry) => matchesRosterMember(entry, member)) ||
    state.bench.some((entry) => matchesRosterMember(entry, member))
  );
}

export function isRosterMemberPlaced(state: LineupEditorState, member: RosterOption): boolean {
  return isPlaced(state, member);
}

/** 이미 배치된 로스터 멤버를 다시 추가하면 아무 일도 일어나지 않는다(참조 동일성 유지) —
 * "중복 배치 불가능"이 리듀서 계층에서 구조적으로 보장된다는 뜻이고, 테스트는
 * `next === state`로 이걸 직접 검증할 수 있다. */
export function addRosterMemberToStarters(state: LineupEditorState, member: RosterOption): LineupEditorState {
  if (isPlaced(state, member)) return state;
  return {
    ...state,
    starters: [...state.starters, makeEntry({ userId: member.userId, displayName: member.displayName })],
    dirty: true,
  };
}

export function addRosterMemberToBench(state: LineupEditorState, member: RosterOption): LineupEditorState {
  if (isPlaced(state, member)) return state;
  return {
    ...state,
    bench: [...state.bench, makeEntry({ userId: member.userId, displayName: member.displayName })],
    dirty: true,
  };
}

/** 비연동 게스트 추가. 이름이 비어 있으면 무시한다(입력 폼 쪽 실수 방지 — 서버도
 * displayName 빈 문자열을 거부하지만 왕복 없이 즉시 알 수 있어야 한다). */
export function addGuestToStarters(state: LineupEditorState, displayName: string): LineupEditorState {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return state;
  return { ...state, starters: [...state.starters, makeEntry({ displayName: trimmed })], dirty: true };
}

export function addGuestToBench(state: LineupEditorState, displayName: string): LineupEditorState {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return state;
  return { ...state, bench: [...state.bench, makeEntry({ displayName: trimmed })], dirty: true };
}

export type LineupSlot = 'starter' | 'bench';

function slotKey(slot: LineupSlot): 'starters' | 'bench' {
  return slot === 'starter' ? 'starters' : 'bench';
}

export function removeEntry(state: LineupEditorState, slot: LineupSlot, key: string): LineupEditorState {
  const field = slotKey(slot);
  const next = state[field].filter((entry) => entry.key !== key);
  if (next.length === state[field].length) return state;
  return { ...state, [field]: next, dirty: true };
}

/** 선발 ↔ 후보 이동. 골키퍼 표시는 후보로 내려가면 항상 해제한다(후보는 골키퍼가 될 수
 * 없다는 서버 규칙, LINEUP_GOALKEEPER_INVALID와 동일한 전제를 프론트에서도 유지). */
export function moveEntry(state: LineupEditorState, from: LineupSlot, key: string, to: LineupSlot): LineupEditorState {
  if (from === to) return state;
  const fromField = slotKey(from);
  const toField = slotKey(to);
  const entry = state[fromField].find((item) => item.key === key);
  if (!entry) return state;
  const moved = to === 'bench' ? { ...entry, goalkeeper: false } : entry;
  return {
    ...state,
    [fromField]: state[fromField].filter((item) => item.key !== key),
    [toField]: [...state[toField], moved],
    dirty: true,
  };
}

export function setJerseyNumber(state: LineupEditorState, slot: LineupSlot, key: string, value: number | null): LineupEditorState {
  const field = slotKey(slot);
  return {
    ...state,
    [field]: state[field].map((entry) => (entry.key === key ? { ...entry, jerseyNumber: value } : entry)),
    dirty: true,
  };
}

/** 선발 중 정확히 한 명만 골키퍼일 수 있다 — 지정한 key를 켜면서 나머지 선발의 골키퍼
 * 표시는 전부 끈다(라디오 버튼과 동일한 의미론). */
export function setGoalkeeper(state: LineupEditorState, key: string): LineupEditorState {
  return {
    ...state,
    starters: state.starters.map((entry) => ({ ...entry, goalkeeper: entry.key === key })),
    dirty: true,
  };
}

export function deriveLineupCounts(state: LineupEditorState, rosterPool: RosterOption[]): LineupCounts {
  return {
    starterCount: state.starters.length,
    benchCount: state.bench.length,
    // isPlaced와 동일한 판정을 재사용한다 — waitingCount와 "추가 가능한 팀원" 목록이
    // 서로 다른 기준으로 어긋나면 카운트만 맞고 목록엔 이미 배치된 사람이 남는(또는 그
    // 반대) 불일치가 생긴다.
    waitingCount: rosterPool.filter((member) => !isPlaced(state, member)).length,
    totalRoster: rosterPool.length,
  };
}

/** 제출 전 클라이언트 사전 검증. 서버가 실제로 강제하는 규칙 중 프론트가 확실히 알 수
 * 있는 것만 검사한다 — 종목별 최소/최대 인원(V1CompetitionConfigVersion.lineup)은 프론트에
 * 노출되는 계약이 없어 여기서 하드코딩하지 않고 서버의 422 LINEUP_SIZE_INVALID 메시지를
 * 그대로 보여주는 쪽을 택했다(잘못된 상수를 만드는 것보다 정직하다). */
export function validateLineupForSubmit(state: LineupEditorState): string[] {
  const errors: string[] = [];
  if (state.starters.length === 0) {
    errors.push('선발 명단을 최소 한 명 이상 등록해 주세요.');
  }
  const goalkeeperCount = state.starters.filter((entry) => entry.goalkeeper).length;
  if (goalkeeperCount === 0) {
    errors.push('선발 라인업에 골키퍼를 한 명 지정해 주세요.');
  } else if (goalkeeperCount > 1) {
    errors.push('골키퍼는 한 명만 지정할 수 있어요.');
  }
  const jerseyNumbers = [...state.starters, ...state.bench]
    .map((entry) => entry.jerseyNumber)
    .filter((value): value is number => value !== null);
  if (new Set(jerseyNumbers).size !== jerseyNumbers.length) {
    errors.push('등번호가 중복돼요. 등번호는 서로 달라야 해요.');
  }
  const emptyNames = [...state.starters, ...state.bench].some((entry) => entry.displayName.trim().length === 0);
  if (emptyNames) {
    errors.push('이름이 비어 있는 선수가 있어요.');
  }
  return errors;
}

function toParticipantInput(entry: LineupEntryDraft): V1TeamMatchLineupParticipantInput {
  return {
    ...(entry.userId ? { userId: entry.userId } : {}),
    displayName: entry.displayName,
    ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
    ...(entry.goalkeeper ? { goalkeeper: true } : {}),
  };
}

export function buildSavePayload(state: LineupEditorState) {
  return {
    expectedVersion: state.baseRevision,
    starters: state.starters.map(toParticipantInput),
    bench: state.bench.map(toParticipantInput),
  };
}

/** 저장 성공(서버 ack) 이후 호출 — 방금 보낸 내용이 곧 새 기준이므로 로컬 starters/bench는
 * 그대로 두고 CAS 토큰만 서버가 확정한 revision으로 갱신한다. PUT 응답은 참가자 목록을
 * 되돌려주지 않는다(Task 14 계약) — echo 불가능이지 버그가 아니다. */
export function applySaveResult(state: LineupEditorState, result: { revision: number }): LineupEditorState {
  return { ...state, baseRevision: result.revision, dirty: false };
}

/** 409 VERSION_CONFLICT의 "새로고침" 액션 — 로컬 미저장 편집은 버리고 서버의 최신 라인업으로
 * 완전히 다시 수화한다. 부분 병합은 하지 않는다: 참가자 식별자가 화면에 없는 이상 "내가
 * 방금 추가한 것"과 "서버에 이미 있던 것"을 안전하게 구분해 합칠 방법이 없다. */
export function applyVersionConflictReload(lineup: V1TeamMatchLineup): LineupEditorState {
  return hydrateLineupEditorState(lineup);
}

/** 409 응답 본문에서 currentVersion을 읽는다. `details`로 감싸지 않은 과거 형태(버그, 이제
 * 수정됨)도 방어적으로 함께 지원 — 백엔드 배포가 프론트보다 늦게 나가는 창구에서도
 * 재시도 로직이 깨지지 않게 한다. */
export function extractConflictCurrentVersion(details: unknown): number | null {
  if (details === null || typeof details !== 'object') return null;
  const record = details as Record<string, unknown>;
  const value = record.currentVersion;
  return typeof value === 'number' ? value : null;
}

/** 내 팀이 자기 사이드를 이제 직접 편집할 수 있는지 결정하는 유일한 지점.
 *
 * - DRAFT: 킥오프 전이면 편집 가능. 킥오프가 지났는데도 DRAFT라면(한 번도 제출하지 않은 채
 *   시간이 지난 경우) 서버가 saveLineup에서 LINEUP_DEADLINE_PASSED로 막으므로 프론트도 미리
 *   막아 헛된 라운드트립을 없앤다.
 * - SUBMITTED: 내 쪽은 직접 재수정할 수 없다 — 상대팀의 정정 요청이 있어야 다시 DRAFT로
 *   열린다(team-match-lineup.service.ts saveLineup의 LINEUP_LOCKED_FOR_DIRECT_EDIT).
 * - LOCKED: 킥오프 이후 자동 잠김. 어느 쪽도 더 이상 바꿀 수 없다.
 */
export function describeLineupPhase(
  state: V1TeamMatchLineupState,
  deadlinePassed: boolean,
): { label: string; editable: boolean; helperText: string } {
  if (state === 'LOCKED') {
    return { label: '잠김', editable: false, helperText: '경기가 시작되어 라인업이 잠겼어요.' };
  }
  if (state === 'SUBMITTED') {
    return {
      label: '제출됨',
      editable: false,
      helperText: '라인업을 제출했어요. 다시 편집하려면 상대팀의 정정 요청이 필요해요.',
    };
  }
  if (deadlinePassed) {
    return {
      label: '수정 마감',
      editable: false,
      helperText: '경기 시작 이후에는 라인업을 직접 수정할 수 없어요.',
    };
  }
  return { label: '초안', editable: true, helperText: '' };
}

export function describePublicationCountdown(publicLineupAt: string | null, now: number): string | null {
  if (publicLineupAt === null) return null;
  const target = new Date(publicLineupAt).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - now;
  if (diffMs <= 0) return '라인업이 공개됐어요.';
  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}분 후 공개돼요.`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}시간 후 공개돼요.` : `${hours}시간 ${minutes}분 후 공개돼요.`;
}
