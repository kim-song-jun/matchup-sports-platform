import { GOALKEEPER_SLOT_CODE, type FormationSlot } from '@/components/lineup/formation-slots';
import { applyAssignmentToEntries, planFormationAssignment } from '@/components/lineup/formation-assignment';
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
 * 포메이션(formation) 입력 — `V1GameLineup.formation` + `V1GameParticipant.positionX/Y`
 * 컬럼이 추가되어(Task 15 blocker-2 해소) 이제 저장·응답 모두 반영된다. 좌표는 자기 진영
 * 기준 0~100 퍼센트(x: 좌우, y=0 골라인 ~ y=100 하프라인)이며 선발(starter)에만 있다 —
 * 후보는 피치 위에 없으므로 좌표 개념 자체가 없다.
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
type MyTeamRow = { teamId: string; role: 'owner' | 'manager' | 'member' };

export function resolveOwnTeamId(
  teamMatch: { hostTeamId?: string; approvedOpponentTeam?: { teamId: string } | null } | undefined,
  /**
   * `useV1MyTeams()`가 주는 값을 그대로 받는다. 이 엔드포인트는 `{ items: [...] }`로 감싼
   * 페이지네이션 응답을 돌려주므로 호출부에서 언랩을 잊으면 `.find is not a function`으로
   * 페이지 전체가 죽는다 — 실제로 라인업/팀매치 두 화면이 그렇게 깨졌다. 언랩을 호출부에
   * 맡기지 않고 여기서 흡수해 같은 실수가 되풀이될 수 없게 한다.
   */
  myTeams: MyTeamRow[] | { items: MyTeamRow[] } | undefined,
): string | null {
  const rows = Array.isArray(myTeams) ? myTeams : myTeams?.items;
  if (!teamMatch || !rows) return null;
  const candidateTeamIds = [teamMatch.hostTeamId, teamMatch.approvedOpponentTeam?.teamId].filter(
    (id): id is string => Boolean(id),
  );
  const match = rows.find(
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
  /** 서버가 준 포지션(DF/MF/FW 등). GK 는 별도 `goalkeeper` 플래그로 오므로 여기선 null 이다.
   * 예전에는 이 값을 수화 단계에서 버려서, 화면이 실제 포지션을 전혀 못 보여주고 모든 행에
   * 붙은 "GK" 라디오 라벨만 남아 전원이 골키퍼인 것처럼 읽혔다. */
  position: string | null;
  /** 피치 배치 좌표, 0~100 퍼센트. 둘 다 있거나 둘 다 null — 배치 안 된 선발은 아직
   * 피치에 없는 것으로 렌더링된다(사이드바 대기열에 남는다). 후보(bench)는 항상 null. */
  positionX: number | null;
  positionY: number | null;
};

export type LineupEditorState = {
  starters: LineupEntryDraft[];
  bench: LineupEntryDraft[];
  /** 다음 저장/제출에 실어 보낼 expectedVersion(=서버의 lineup revision). */
  baseRevision: number;
  /** 포메이션 프리셋 라벨(예: "4-4-2"). 자유 배치면 null — 프리셋 선택 UI 복원용 힌트일 뿐,
   * 실제 좌표는 각 entry의 positionX/Y가 진실이다. */
  formation: string | null;
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
  position?: string | null;
  positionX?: number | null;
  positionY?: number | null;
}): LineupEntryDraft {
  return {
    key: randomUuid(),
    userId: input.userId ?? null,
    displayName: input.displayName,
    jerseyNumber: input.jerseyNumber ?? null,
    goalkeeper: input.goalkeeper ?? false,
    position: input.position ?? null,
    positionX: input.positionX ?? null,
    positionY: input.positionY ?? null,
  };
}

export function createEmptyLineupEditorState(baseRevision: number): LineupEditorState {
  return { starters: [], bench: [], baseRevision, formation: null, dirty: false };
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
        position: starter.position,
        positionX: starter.positionX,
        positionY: starter.positionY,
      }),
    ),
    bench: lineup.bench.map((entry) => makeEntry({ displayName: entry.displayName, jerseyNumber: entry.jerseyNumber })),
    baseRevision: lineup.revision,
    formation: lineup.formation,
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

/**
 * 불러온 라인업으로 명단 전체를 갈아끼운다.
 *
 * 대회 경기 화면(applyLoadedSelection)과 결정적으로 다르다. 그쪽은 등록 명단이 고정돼
 * 있어서 "누가 선발인지"만 덧입히지만, 팀 매치는 **명단 자체를 팀장이 정한다** — 그래서
 * 불러오기가 명단을 통째로 대신 채운다. 지금 작성 중이던 내용은 사라지므로 호출부가
 * 먼저 확인을 받는다.
 *
 * 부분 병합은 하지 않는다. 화면이 엔트리 식별자를 들고 있지 않아 "내가 방금 넣은 사람"과
 * "불러온 사람"을 안전하게 합칠 방법이 없다 — applyVersionConflictReload가 같은 이유로
 * 같은 선택을 한다.
 *
 * `keepPlacement`가 false면 좌표·포지션·포메이션을 버리고 명단 구성만 가져온다(종목이
 * 다른 라인업을 불러올 때).
 */
export function replaceEntries(
  state: LineupEditorState,
  entries: ReadonlyArray<{
    userId: string | null;
    displayName: string;
    jerseyNumber: number | null;
    position: string | null;
    positionX: number | null;
    positionY: number | null;
    started: boolean;
    goalkeeper: boolean;
  }>,
  options: { formation: string | null; keepPlacement: boolean },
): LineupEditorState {
  const toDraft = (entry: (typeof entries)[number]): LineupEntryDraft =>
    makeEntry({
      userId: entry.userId,
      displayName: entry.displayName,
      jerseyNumber: entry.jerseyNumber,
      goalkeeper: entry.started && entry.goalkeeper,
      position: options.keepPlacement && !entry.goalkeeper ? entry.position : null,
      positionX: options.keepPlacement ? entry.positionX : null,
      positionY: options.keepPlacement ? entry.positionY : null,
    });

  return {
    ...state,
    starters: entries.filter((entry) => entry.started).map(toDraft),
    // 후보는 피치 위에 없으므로 좌표도 골키퍼 표시도 갖지 않는다.
    bench: entries
      .filter((entry) => !entry.started)
      .map((entry) => ({ ...toDraft(entry), goalkeeper: false, positionX: null, positionY: null })),
    formation: options.keepPlacement ? options.formation : null,
    dirty: true,
  };
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

/** removeEntry로 지운 엔트리를 원래 슬롯의 원래 인덱스에 되돌린다 — 실행취소(undo).
 * 등번호·GK 지정·피치 좌표까지 포함한 엔트리 전체를 그대로 복원하므로 "제거" 버튼이
 * 실제로는 완전 삭제(선발↔후보 이동인 moveEntry와 달리)라는 점을 되돌릴 수 있게 해준다.
 * index가 현재 배열 길이를 넘으면(그 사이 다른 편집으로 배열이 짧아졌을 때) 맨 끝에 붙인다. */
export function restoreEntry(
  state: LineupEditorState,
  slot: LineupSlot,
  entry: LineupEntryDraft,
  index: number,
): LineupEditorState {
  const field = slotKey(slot);
  const list = state[field];
  const clampedIndex = Math.max(0, Math.min(index, list.length));
  const next = [...list.slice(0, clampedIndex), entry, ...list.slice(clampedIndex)];
  return { ...state, [field]: next, dirty: true };
}

/** 선발 ↔ 후보 이동. 골키퍼 표시·피치 좌표는 후보로 내려가면 항상 해제한다(후보는
 * 골키퍼가 될 수 없다는 서버 규칙과 동일한 전제, 그리고 피치 위에 없으므로 좌표도 무의미). */
export function moveEntry(state: LineupEditorState, from: LineupSlot, key: string, to: LineupSlot): LineupEditorState {
  if (from === to) return state;
  const fromField = slotKey(from);
  const toField = slotKey(to);
  const entry = state[fromField].find((item) => item.key === key);
  if (!entry) return state;
  const moved = to === 'bench' ? { ...entry, goalkeeper: false, positionX: null, positionY: null } : entry;
  return {
    ...state,
    [fromField]: state[fromField].filter((item) => item.key !== key),
    [toField]: [...state[toField], moved],
    dirty: true,
  };
}

/** 선발 한 명의 피치 좌표를 설정한다(드래그·탭 배치 둘 다 이 함수 하나로 귀결). 0~100
 * 밖의 값은 호출부(포메이션 에디터)가 clamp해서 넘기므로 여기서는 그대로 저장한다. */
export function setPlayerPosition(
  state: LineupEditorState,
  key: string,
  positionX: number,
  positionY: number,
): LineupEditorState {
  return {
    ...state,
    starters: state.starters.map((entry) => (entry.key === key ? { ...entry, positionX, positionY } : entry)),
    dirty: true,
  };
}

/** 선발 한 명을 피치에서 다시 대기 상태로 되돌린다(좌표만 지움, 선발 목록에는 남는다) —
 * "배치 취소"와 "후보로 내리기"는 다른 동작이라 구분한다. */
export function clearPlayerPosition(state: LineupEditorState, key: string): LineupEditorState {
  return {
    ...state,
    starters: state.starters.map((entry) => (entry.key === key ? { ...entry, positionX: null, positionY: null } : entry)),
    dirty: true,
  };
}

/** 포메이션 라벨만 바꾼다 — 이미 배치된 선수의 좌표는 건드리지 않는다(D-8). "포메이션
 * 선택"과 "선수 배치"는 분리된 두 단계다: 선택은 빈 슬롯(포지션 라벨)을 노출할 뿐이고,
 * 실제 배치는 placeInSlot으로 한 명씩 이뤄진다. null은 "자유 배치"(슬롯 없음)로의 전환. */
export function selectFormation(state: LineupEditorState, formation: string | null): LineupEditorState {
  return { ...state, formation, dirty: true };
}

/** 빈 슬롯에 대기 중인 선수 한 명을 채운다. 골키퍼 슬롯이면 이 선수를 골키퍼로 지정하고
 * (다른 선발의 골키퍼 표시는 setGoalkeeper와 동일한 라디오 의미론으로 해제한다), 아니면
 * 슬롯의 positionCode를 그대로 옮겨 담는다. */
export function placeInSlot(state: LineupEditorState, key: string, slot: FormationSlot): LineupEditorState {
  const isGoalkeeperSlot = slot.positionCode === 'GK';
  return {
    ...state,
    starters: state.starters.map((entry) => {
      if (entry.key !== key) {
        return isGoalkeeperSlot && entry.goalkeeper ? { ...entry, goalkeeper: false } : entry;
      }
      return {
        ...entry,
        positionX: slot.x,
        positionY: slot.y,
        position: isGoalkeeperSlot ? null : slot.positionCode,
        goalkeeper: isGoalkeeperSlot,
      };
    }),
    dirty: true,
  };
}

/** 슬롯에서 선수를 빼낸다 — 좌표뿐 아니라 positionCode·골키퍼 지정까지 함께 지워 "완전한
 * 대기 상태"로 되돌린다. 좌표만 지우는 clearPlayerPosition(자유 배치 전용, 아래 그대로
 * 유지)과 의도적으로 다르다: 슬롯 모드에서 좌표만 지우면 positionCode가 남아
 * matchSlotsToEntries가 엉뚱한 슬롯을 이미 채운 것으로 오인할 수 있다. */
export function unplaceFromSlot(state: LineupEditorState, key: string): LineupEditorState {
  return {
    ...state,
    starters: state.starters.map((entry) =>
      entry.key === key
        ? { ...entry, positionX: null, positionY: null, position: null, goalkeeper: false }
        : entry,
    ),
    dirty: true,
  };
}

/** 슬롯 하나에 어느 선발이 채워져 있는지 짝짓는다. 컴포넌트(렌더링)·
 * validateLineupForSubmit(제출 검증)·fixture 화면(대회 fixture 라인업, 상태 타입은 달라도
 * starters: LineupEntryDraft[]는 동일해 그대로 재사용) 세 곳이 공유하는 단일 진실 공급원.
 *
 * 짝짓기 자체는 formation-assignment.ts의 최소 비용 매칭에 위임한다 — 예전에는 이 함수가
 * positionCode 완전일치로만 매칭하는 별도 구현을 갖고 있었고, 그래서 (a) 포메이션을 바꿔
 * 그 코드 슬롯이 사라진 선수가 조용히 탈락해 피치에서 증발했고, (b) 좌표 없이 position만
 * 남은 레거시 엔트리를 "채워진 슬롯"으로 세면서 실제 렌더링은 좌표 폴백(50,50)으로 중앙에
 * 그려 슬롯 라벨과 어긋났다. 이제 "배치됨"의 기준이 자유 배치 모드와 동일하게 **좌표 유무**
 * 하나로 통일된다.
 *
 * 드래그로 좌표가 슬롯 원위치에서 벗어나도 그 슬롯을 채운 것으로 인식하는 기존 계약은
 * 그대로다 — 최소 비용 매칭이 가장 가까운 슬롯에 붙이고, positionCode가 일치하면 그쪽을
 * 압도적으로 우선하기 때문이다. */
export function matchSlotsToEntries(
  slots: FormationSlot[],
  starters: LineupEntryDraft[],
): Array<{ slot: FormationSlot; entry: LineupEntryDraft | null }> {
  const plan = planFormationAssignment(slots, starters);
  const entryByKey = new Map(starters.map((entry) => [entry.key, entry]));
  return plan.slotAssignments.map(({ slot, entryKey }) => ({
    slot,
    entry: entryKey === null ? null : entryByKey.get(entryKey) ?? null,
  }));
}

/**
 * 지정한 선발들을 지금 포메이션의 빈 자리에 앉힌다 — "선수를 등록하면 알아서 자리에
 * 들어간다"는 동작의 유일한 구현체다.
 *
 * **호출 시점을 좁게 유지하는 것이 이 함수의 핵심 계약이다.** 호출부는 방금 선발이 된
 * 사람(그리고 방금 골키퍼로 지정된 사람)의 key만 `seatKeys`로 넘긴다. 포메이션을 바꿀 때는
 * 이 함수를 부르지 않는다 — 그때 이미 배치된 선수를 옮기는 일은 formation-assignment.ts가
 * 맡고, 대기 중이던 선수를 그 김에 끌어들이지는 않는다("아무것도 선택하지 않았는데 선수가
 * 들어가 있다"는 제보가 바로 그 무분별한 자동 채우기 때문이었다).
 *
 * 골키퍼 자리에는 `goalkeeper` 플래그가 켜진 사람만 앉는다. 필드 선수는 골키퍼 자리를
 * 절대 차지하지 않고, 앉을 자리가 없으면 조용히 대기로 남는다. 바꿀 게 없으면 **원본 배열
 * 참조를 그대로** 돌려주므로 호출부가 결과로 setState를 해도 불필요한 렌더가 생기지 않는다.
 */
export function seatStartersInEmptySlots(
  starters: LineupEntryDraft[],
  slots: FormationSlot[],
  seatKeys: readonly string[],
): LineupEntryDraft[] {
  const seating = new Set(seatKeys);
  // 아직 피치에 없는 사람만 대상 — 이미 좌표가 있는 선수는 사용자가 직접 놓았거나 드래그로
  // 옮긴 것이므로 건드리지 않는다.
  const toSeat = starters.filter(
    (entry) => seating.has(entry.key) && (entry.positionX === null || entry.positionY === null),
  );
  if (toSeat.length === 0) return starters;

  const emptySlots = matchSlotsToEntries(slots, starters)
    .filter((row) => row.entry === null)
    .map((row) => row.slot);
  if (emptySlots.length === 0) return starters;

  const assignments = new Map<string, FormationSlot>();
  const takenSlots = new Set<FormationSlot>();
  for (const entry of toSeat) {
    const slot = emptySlots.find((candidate) => {
      if (takenSlots.has(candidate)) return false;
      const isGoalkeeperSlot = candidate.positionCode === GOALKEEPER_SLOT_CODE;
      return entry.goalkeeper ? isGoalkeeperSlot : !isGoalkeeperSlot;
    });
    if (slot === undefined) continue;
    takenSlots.add(slot);
    assignments.set(entry.key, slot);
  }
  if (assignments.size === 0) return starters;

  return starters.map((entry) => {
    const slot = assignments.get(entry.key);
    if (slot === undefined) return entry;
    const isGoalkeeperSlot = slot.positionCode === GOALKEEPER_SLOT_CODE;
    return {
      ...entry,
      positionX: slot.x,
      positionY: slot.y,
      position: isGoalkeeperSlot ? null : slot.positionCode,
      goalkeeper: isGoalkeeperSlot,
    };
  });
}

/** 포메이션 프리셋을 실제로 적용한다 — 라벨만 바꾸는 selectFormation과 달리 이미 배치된
 * 선수를 새 슬롯 좌표로 재배치하고, 자리가 부족해 남는 선수는 대기로 내려보낸다(좌표까지
 * 완전히 지운다). 프리셋 전환에서 선수가 사라지던 결함의 수정 지점이며, 확인 모달이
 * describeFormationChange로 보여준 예고와 정확히 같은 계획을 적용한다. */
export function applyFormationPreset(
  state: LineupEditorState,
  formation: string,
  slots: FormationSlot[],
): LineupEditorState {
  const plan = planFormationAssignment(slots, state.starters);
  return {
    ...state,
    formation,
    starters: applyAssignmentToEntries(state.starters, plan),
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
export function validateLineupForSubmit(
  state: LineupEditorState,
  activeSlots: FormationSlot[] | null,
): string[] {
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
  if (activeSlots !== null) {
    const emptySlotCount = matchSlotsToEntries(activeSlots, state.starters).filter((row) => row.entry === null).length;
    if (emptySlotCount > 0) {
      errors.push(`아직 채우지 않은 포지션 자리가 ${emptySlotCount}개 있어요.`);
    }
  }
  return errors;
}

function toParticipantInput(entry: LineupEntryDraft): V1TeamMatchLineupParticipantInput {
  return {
    ...(entry.userId ? { userId: entry.userId } : {}),
    displayName: entry.displayName,
    ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
    ...(entry.goalkeeper ? { goalkeeper: true } : {}),
    // 정찰에서 발견한 기존 버그: DTO엔 position 필드가 있는데 여기서 빠져 있어 슬롯
    // 배치의 positionCode가 저장 즉시 사라졌다.
    ...(entry.position !== null ? { position: entry.position } : {}),
    ...(entry.positionX !== null && entry.positionY !== null
      ? { positionX: entry.positionX, positionY: entry.positionY }
      : {}),
  };
}

export function buildSavePayload(state: LineupEditorState) {
  return {
    expectedVersion: state.baseRevision,
    ...(state.formation !== null ? { formation: state.formation } : {}),
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
