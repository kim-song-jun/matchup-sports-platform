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
 * 포메이션(formation)·좌표(`V1GameParticipant.positionX/Y`)는 **이 화면이 편집하지
 * 않는다** — Task 163 이 배치 편집기를 전술보드로 옮겼다(정본 §3). 여기서는 읽어서 그대로
 * 되돌려 보내기만 한다: 저장이 명단 전체를 덮어쓰기 때문에, 싣지 않으면 명단 한 줄 고칠
 * 때마다 전술보드가 잡아 둔 배치가 지워진다. 좌표는 자기 진영 기준 0~100 퍼센트
 * (x: 좌우, y=0 골라인 ~ y=100 하프라인).
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
  teamMatch:
    | {
        hostTeamId?: string;
        /** 팀 매치 상세 응답이 실제로 호스트팀을 싣는 자리. `hostTeamId`는 목록 응답에만
         * 있고 상세에는 없어서, 이걸 보지 않으면 **호스트팀 팀장이 자기 팀을 못 찾는다**
         * (2026-08-13 로컬 검증에서 확인: 상세 응답에 hostTeamId 키 자체가 없다). 그 결과
         * 호스트 쪽 팀장에게는 로스터 풀도 "이전 라인업 불러오기"도 뜨지 않았고, 상대팀
         * (신청) 쪽 팀장만 화면이 정상으로 보였다. */
        hostTeam?: { teamId: string } | null;
        approvedOpponentTeam?: { teamId: string } | null;
      }
    | undefined,
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
  const candidateTeamIds = [
    teamMatch.hostTeamId ?? teamMatch.hostTeam?.teamId,
    teamMatch.approvedOpponentTeam?.teamId,
  ].filter((id): id is string => Boolean(id));
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
  /** 피치 배치 좌표, 0~100 퍼센트. 둘 다 있거나 둘 다 null(아직 전술보드에서 배치되지
   * 않은 사람). 이 화면은 값을 읽어 보존만 한다 — 편집은 전술보드가 한다. */
  positionX: number | null;
  positionY: number | null;
};

export type LineupEditorState = {
  /**
   * **명단 = 출전자.** 선발/후보를 가르지 않는다(정본 §3, 2026-09-02 사용자 확정) —
   * 생활체육 경기는 롤링 교체라 "선발" 이 의미를 갖지 않는다.
   *
   * `positionX`/`positionY`·`formation` 은 **여기서 편집하지 않는다.** 편집기는
   * 전술보드(`/teams/:id/tactics/:gameId`)이고, 이 화면은 서버에서 받은 값을 그대로
   * 되돌려 보내 **보존만** 한다 — 안 실어 보내면 저장 한 번에 배치가 지워진다.
   */
  participants: LineupEntryDraft[];
  /** 다음 저장/제출에 실어 보낼 expectedVersion(=서버의 lineup revision). */
  baseRevision: number;
  /** 포메이션 프리셋 라벨(예: "4-4-2"). 자유 배치면 null — 프리셋 선택 UI 복원용 힌트일 뿐,
   * 실제 좌표는 각 entry의 positionX/Y가 진실이다. */
  formation: string | null;
  /** 마지막으로 서버에 반영된(ack된) 상태와 로컬 상태가 다른지 — true일 때만 자동저장을 예약한다. */
  dirty: boolean;
};

export type LineupCounts = {
  /** 명단에 올린 인원 — 선발/후보 구분이 없으므로 하나다(정본 §3). */
  participantCount: number;
  /** 로스터 중 아직 명단에 올리지 않은 인원 수. */
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
  return { participants: [], baseRevision, formation: null, dirty: false };
}

/** GET 응답으로부터 편집기 상태를 새로 만든다 — 페이지 최초 진입, 그리고 버전 충돌 시
 * "새로고침" 액션(applyVersionConflictReload) 둘 다 이 함수를 거친다. 서버가 돌려주는
 * starters/bench는 displayName 스냅샷뿐이라 userId는 전부 null로 재수화된다(위 LineupEntryDraft
 * 주석 참고) — 그래서 그대로 재저장하면 링크가 사라지는 게 아니라, 애초에 저장 시점에
 * 링크 여부를 다시 선택해야 하는 게 이 계약의 정직한 동작이다.
 */
export function hydrateLineupEditorState(lineup: V1TeamMatchLineup): LineupEditorState {
  // 서버는 아직 `starters`/`bench` 로 내려준다(응답 계약은 이 태스크가 바꾸지 않는다) —
  // #978 이후 **둘 다 같은 출전자 명단**이고 `bench` 는 항상 비어 있다. 그래도 두 배열을
  // 다 읽어 합치는 이유는, 이 변경 이전에 저장된 라인업에 후보로 남은 사람이 있으면
  // 그 사람이 화면에서 조용히 사라지면 안 되기 때문이다.
  return {
    participants: [
      ...lineup.starters.map((starter) =>
        makeEntry({
          displayName: starter.displayName,
          jerseyNumber: starter.jerseyNumber,
          goalkeeper: starter.goalkeeper,
          position: starter.position,
          // 좌표는 전술보드가 편집한다 — 여기선 읽어서 그대로 되돌려 보낸다(보존).
          positionX: starter.positionX,
          positionY: starter.positionY,
        }),
      ),
      ...lineup.bench.map((entry) =>
        makeEntry({ displayName: entry.displayName, jerseyNumber: entry.jerseyNumber }),
      ),
    ],
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
  return state.participants.some((entry) => matchesRosterMember(entry, member));
}

export function isRosterMemberPlaced(state: LineupEditorState, member: RosterOption): boolean {
  return isPlaced(state, member);
}

/** 이미 배치된 로스터 멤버를 다시 추가하면 아무 일도 일어나지 않는다(참조 동일성 유지) —
 * "중복 배치 불가능"이 리듀서 계층에서 구조적으로 보장된다는 뜻이고, 테스트는
 * `next === state`로 이걸 직접 검증할 수 있다. */
export function addRosterMemberToLineup(state: LineupEditorState, member: RosterOption): LineupEditorState {
  if (isPlaced(state, member)) return state;
  return {
    ...state,
    participants: [
      ...state.participants,
      makeEntry({ userId: member.userId, displayName: member.displayName }),
    ],
    dirty: true,
  };
}

/** 로스터에 없는 사람(게스트·용병)을 이름만으로 명단에 넣는다. */
export function addGuestToLineup(state: LineupEditorState, displayName: string): LineupEditorState {
  const trimmed = displayName.trim();
  if (trimmed === '') return state;
  return { ...state, participants: [...state.participants, makeEntry({ displayName: trimmed })], dirty: true };
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
  // `started` 는 **읽기만** 한다. 저장된 프리셋·과거 라인업에는 아직 그 값이 있지만
  // (팀 프리셋은 이 태스크가 건드리지 않는 팀 내부 도구다), 명단에는 선발/후보 구분이
  // 없으므로 **전원을 그대로 싣는다** — 후보였던 사람을 빠뜨리면 불러오기가 명단을
  // 조용히 줄인다.
  return {
    ...state,
    participants: entries.map((entry) =>
      makeEntry({
        userId: entry.userId,
        displayName: entry.displayName,
        jerseyNumber: entry.jerseyNumber,
        goalkeeper: entry.goalkeeper,
        position: options.keepPlacement && !entry.goalkeeper ? entry.position : null,
        positionX: options.keepPlacement ? entry.positionX : null,
        positionY: options.keepPlacement ? entry.positionY : null,
      }),
    ),
    formation: options.keepPlacement ? options.formation : null,
    dirty: true,
  };
}

export function removeEntry(state: LineupEditorState, key: string): LineupEditorState {
  const next = state.participants.filter((entry) => entry.key !== key);
  if (next.length === state.participants.length) return state;
  return { ...state, participants: next, dirty: true };
}

/** `removeEntry` 로 지운 엔트리를 원래 인덱스에 되돌린다 — 실행취소(undo). 등번호·GK
 * 지정까지 엔트리 전체를 그대로 복원한다. index 가 현재 길이를 넘으면 맨 끝에 붙인다. */
export function restoreEntry(
  state: LineupEditorState,
  entry: LineupEntryDraft,
  index: number,
): LineupEditorState {
  const clampedIndex = Math.max(0, Math.min(index, state.participants.length));
  const next = [
    ...state.participants.slice(0, clampedIndex),
    entry,
    ...state.participants.slice(clampedIndex),
  ];
  return { ...state, participants: next, dirty: true };
}

export function setJerseyNumber(
  state: LineupEditorState,
  key: string,
  value: number | null,
): LineupEditorState {
  return {
    ...state,
    participants: state.participants.map((entry) =>
      entry.key === key ? { ...entry, jerseyNumber: value } : entry,
    ),
    dirty: true,
  };
}

/** 골키퍼 지정은 **한 번에 한 명**이다 — 지정한 key 를 켜면서 나머지는 전부 끈다(라디오
 * 버튼과 같은 의미론). "정확히 한 명" 이 아니다: 아무도 지정하지 않은 상태(전원 false)가
 * 정상이고 제출도 통과한다 — 163 BE-1 이 서버에서 GK 검증을 지웠기 때문이다(정본 §3).
 * 이 함수는 상한만 강제하고 하한은 강제하지 않는다. */
export function setGoalkeeper(state: LineupEditorState, key: string): LineupEditorState {
  return {
    ...state,
    participants: state.participants.map((entry) => ({ ...entry, goalkeeper: entry.key === key })),
    dirty: true,
  };
}

export function deriveLineupCounts(state: LineupEditorState, rosterPool: RosterOption[]): LineupCounts {
  return {
    participantCount: state.participants.length,
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
  if (state.participants.length === 0) {
    errors.push('출전 명단을 최소 한 명 이상 등록해 주세요.');
  }
  // **골키퍼 개수는 검증하지 않는다.** 예전엔 "선발에 반드시 한 명" 이었는데, 163 BE-1 이
  // 서버에서 인원·GK 검증을 지웠다(정본 §3 — 어느 경로든 검증하지 않는다). 여기에만
  // 상한을 남기면 **서버가 받아 주는 입력을 FE 가 막는** 클라이언트 전용 규칙이 되고,
  // 그건 화면마다 다른 규칙이 생기는 출발점이다. GK 표시 자체는 남는다(전적·기록용).
  const jerseyNumbers = state.participants
    .map((entry) => entry.jerseyNumber)
    .filter((value): value is number => value !== null);
  if (new Set(jerseyNumbers).size !== jerseyNumbers.length) {
    errors.push('등번호가 중복돼요. 등번호는 서로 달라야 해요.');
  }
  if (state.participants.some((entry) => entry.displayName.trim().length === 0)) {
    errors.push('이름이 비어 있는 선수가 있어요.');
  }
  // 포메이션 자리 검사는 없앴다 — 배치는 전술보드가 하고 이 화면은 명단만 다룬다.
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
    // 전술보드가 정한 배치를 그대로 되돌려 보낸다 — 여기서 편집하지 않지만 빼면 지워진다.
    ...(state.formation !== null ? { formation: state.formation } : {}),
    // 단일 배열이다. 서버(`rosterOf`)는 `participants` 가 있으면 그것을 명단으로 쓰고,
    // 없을 때만 옛 `starters`+`bench` 를 합친다 — 우리는 새 계약을 쓴다.
    participants: state.participants.map(toParticipantInput),
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
