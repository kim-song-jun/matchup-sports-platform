import { GOALKEEPER_SLOT_CODE, type FormationSlot } from '@/components/lineup/formation-slots';
import { applyAssignmentToEntries, planFormationAssignment } from '@/components/lineup/formation-assignment';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { randomUuid } from '@/lib/uuid';
import { formatKstMeridiemTime, formatTournamentDateShort } from '@/lib/date-utils';
import { TEAM_MATCH_CANCELLED_LABEL } from '@/lib/v1-status-labels';
import type {
  V1LineupConfig,
  V1TeamMatchRsvpStatus,
  V1TeamMatchLineup,
  V1TeamMatchLineupParticipantInput,
  V1TeamMatchLineupState,
  V1TeamMatchLineupLockReason,
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
  /** 멤버 관리에서 지정한 팀 고정 등번호. 명단에 넣을 때 기본값으로 쓴다. */
  jerseyNumber?: number | null;
  /** 번호 시트의 "팀 번호도 함께"가 고칠 멤버십. 없으면 팀 번호를 바꿀 수 없다. */
  membershipId?: string;
  /** 이 경기 팀 일정 응답 — 팀장 참고용 읽기 전용 칩(H5). */
  rsvpStatus?: V1TeamMatchRsvpStatus | null;
  /** 상대 팀에도 활성 멤버(W4-V4) — 칩으로 알리고 "모두 넣기"에서 기본으로 뺀다. 한 명씩 추가는 막지 않는다. */
  alsoOpponentMember?: boolean;
};

/** 등번호순, 번호 없는 사람은 뒤, 같으면 이름순 — 명단과 후보가 같은 순서 규칙을 쓴다(H5). */
export function compareByJersey(
  a: { jerseyNumber?: number | null; displayName: string },
  b: { jerseyNumber?: number | null; displayName: string },
): number {
  return (
    (a.jerseyNumber ?? Number.MAX_SAFE_INTEGER) - (b.jerseyNumber ?? Number.MAX_SAFE_INTEGER) ||
    a.displayName.localeCompare(b.displayName, 'ko')
  );
}

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

/**
 * 이 참석명단 화면이 대회·리그 경기로 열렸는가(옛 알림 링크 등). 그 경기 명단은 참가 명단에서
 * 계산돼 여기서의 저장·제출이 409 `ROSTER_MANAGED_BY_ADJUSTMENTS` 다(Task 179).
 * 팀매치 상세는 대회 경기를 `NOT_FOUND_OR_ARCHIVED` 로 숨기고 명단 조회만 성공시킨다.
 */
export function isCompetitionLineupRoute(input: {
  league: object | null | undefined;
  teamMatchErrorCode: string | null;
  lineupLoaded: boolean;
}): boolean {
  return Boolean(input.league) || (input.lineupLoaded && input.teamMatchErrorCode === 'NOT_FOUND_OR_ARCHIVED');
}

/** 대회·리그 경기 명단 화면 경로. 팀매치 상세가 없는 대회 경기는 명단 응답의 사이드로 팀을 찾는다. */
export function competitionRosterHref(
  ownTeamId: string | null,
  lineup: { gameId: string; sideId: string } | undefined,
  gameSides: ReadonlyArray<{ id: string; teamId: string | null }> | undefined,
): string | null {
  if (lineup === undefined) return null;
  const teamId = ownTeamId ?? gameSides?.find((side) => side.id === lineup.sideId)?.teamId ?? null;
  return teamId === null ? null : gameRosterScreenPath(teamId, lineup.gameId);
}

/** 편집기 안에서 다루는 한 명분 엔트리. `userId`가 없으면 비연동 게스트(D-03) —
 * 개인 기록에는 반영되지 않고 팀 집계에만 잡히는 스냅샷이다. */
export type LineupEntryDraft = {
  /** React key + 중복 배치 판정용 안정적 로컬 식별자. userId와는 별개다 — 게스트 엔트리는
   * 애초에 userId가 없고, 같은 사람을 두 번 배치했는지 같은 판정은 로컬 키로 한다. */
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
 * "새로고침" 액션(applyVersionConflictReload) 둘 다 이 함수를 거친다.
 *
 * **`userId`를 그대로 이어받는다.** 서버는 예전부터 참가자의 `userId`를 실어 보냈는데
 * (`team-match-lineup.service.ts`의 라인업 조회 매퍼) 응답 타입에 그 칸이 없어 화면이
 * 쓰지 못했다 — 그래서 다시 불러오면 연동 선수가 전부 이름뿐인 게스트로 재수화됐고,
 * 그대로 저장하면 **연결이 조용히 끊겼다**. 연결이 끊기면 개인 기록·상호평가·징계
 * 추적이 그 사람을 못 찾는다.
 */
export function hydrateLineupEditorState(lineup: V1TeamMatchLineup): LineupEditorState {
  // **`revision === 1` 은 팀이 작성한 명단이 아니다.** 경기가 만들어질 때 자동으로 깔리는
  // 미편집 행이고, 그 참가자는 대진 생성 시점의 **팀 전체 활성 멤버 스냅샷**이다
  // (league-fixture-creation.ts · team-matches.service.ts 의 approved-away 스냅샷). 그
  // 스냅샷에는 일부러 `userId` 를 붙이지 않는다 — 한 경기도 안 뛴 팀원에게 신원 연결을
  // 만들면 개인 기록·상호평가가 전부 거짓이 되기 때문이다(그 파일의 근거 주석 참조).
  //
  // 그것을 편집기의 시작 상태로 삼으면 팀장은 **자기가 짜지 않은 명단**을 보고, 그대로
  // 저장하는 순간 팀 전원이 이름뿐인 게스트로 박제된다. 그래서 빈 명단에서 시작해
  // `eligibleMembers`(진짜 `userId` 를 지닌 목록)에서 골라 넣게 한다.
  //
  // `revision === 1` 을 "저장한 적 없음" 으로 읽는 것은 이 저장소가 이미 쓰는 판정이다
  // (games.service.ts 의 팀별 라인업 작성 현황 `lineupState`) — 같은 뜻에 두 정의를
  // 만들지 않으려고 그 규칙을 그대로 쓴다. CAS 토큰(`baseRevision`)은 그대로 1 이다.
  if (lineup.revision === 1) {
    return createEmptyLineupEditorState(lineup.revision);
  }
  // 서버는 아직 `starters`/`bench` 로 내려준다(응답 계약은 이 태스크가 바꾸지 않는다) —
  // #978 이후 **둘 다 같은 출전자 명단**이고 `bench` 는 항상 비어 있다. 그래도 두 배열을
  // 다 읽어 합치는 이유는, 이 변경 이전에 저장된 라인업에 후보로 남은 사람이 있으면
  // 그 사람이 화면에서 조용히 사라지면 안 되기 때문이다.
  return {
    participants: [
      ...lineup.starters.map((starter) =>
        makeEntry({
          userId: starter.userId,
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

/**
 * 편집할 수 없는 명단(추가만·잠김)을 서버 응답 그대로 보인다 — 키는 참가자 id 라 늦게 온 선수가 붙어도
 * 행이 흔들리지 않는다. `revision === 1` 은 팀이 짠 명단이 아니라서(위 hydrate 참고) 빈 목록이다.
 */
export function serverRosterEntries(lineup: V1TeamMatchLineup): LineupEntryDraft[] {
  if (lineup.revision === 1) return [];
  return [
    ...lineup.starters.map((row) => ({
      key: row.id,
      userId: row.userId,
      displayName: row.displayName,
      jerseyNumber: row.jerseyNumber,
      goalkeeper: row.goalkeeper,
      position: row.position,
      positionX: row.positionX,
      positionY: row.positionY,
    })),
    ...lineup.bench.map((row) => ({
      key: row.id,
      userId: null,
      displayName: row.displayName,
      jerseyNumber: row.jerseyNumber,
      goalkeeper: false,
      position: null,
      positionX: null,
      positionY: null,
    })),
  ];
}

/** 엔트리 하나가 이 로스터 멤버를 가리키는지 판정한다.
 *
 * - `entry.userId`가 있으면 userId를 그대로 비교한다 — 가장 정확한 신호이고, **재수화된
 *   엔트리도 이제 여기 해당한다**(hydrateLineupEditorState가 서버의 userId를 이어받는다).
 * - `entry.userId`가 null인 것은 **실제 비연동 게스트**뿐이다. 게스트는 플랫폼 계정이
 *   없어 이름이 정체성의 전부라, 유일하게 남은 신호인 displayName 완전 일치로 대체한다.
 *   한계: 팀원과 이름이 완전히 같은 게스트를 넣어 두면 그 팀원이 "이미 배치됨"으로
 *   묶여 다시 추가되지 않는다 — 같은 사람이 두 번 등록되는 것(Task 15 blocker-1)보다는
 *   안전한 방향이라 그대로 둔다.
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
  // 팀 번호가 이미 명단의 다른 행에 있으면 빈칸으로 둔다 — 같은 번호를 채우면 제출 검증이 막는다.
  const teamNumber = member.jerseyNumber ?? null;
  const jerseyNumber = teamNumber !== null && findJerseyHolder(state, teamNumber) === null ? teamNumber : null;
  return {
    ...state,
    participants: [
      ...state.participants,
      makeEntry({ userId: member.userId, displayName: member.displayName, jerseyNumber }),
    ],
    dirty: true,
  };
}

/**
 * 아직 명단에 없는 팀원을 번호순으로 한 번에 넣는다("팀원 전원 추가", H5 A-1). 팀 번호가 이미 다른 행과
 * 겹치면 `addRosterMemberToLineup` 처럼 빈칸으로 둔다 — 겹친 사람 이름을 돌려줘 화면이 알린다.
 * 상대 팀에도 소속된 팀원은 넣지 않고 이름만 돌려준다(W4-V4) — 두 팀 명단에 휩쓸려 들어가지 않게.
 */
export function addAllRosterMembersToLineup(
  state: LineupEditorState,
  members: readonly RosterOption[],
): { state: LineupEditorState; clearedJersey: string[]; skippedOpponent: string[] } {
  let next = state;
  const clearedJersey: string[] = [];
  const skippedOpponent: string[] = [];
  for (const member of [...members].sort(compareByJersey)) {
    if (isPlaced(next, member)) continue;
    if (member.alsoOpponentMember === true) {
      skippedOpponent.push(member.displayName);
      continue;
    }
    const collides = member.jerseyNumber != null && findJerseyHolder(next, member.jerseyNumber) !== null;
    next = addRosterMemberToLineup(next, member);
    if (collides) clearedJersey.push(member.displayName);
  }
  return { state: next, clearedJersey, skippedOpponent };
}

/** "모두 넣기"에서 뺀 두 팀 소속 팀원 안내(W4-V4). 뺀 사람이 없으면 null. */
export function describeOpponentSkipped(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const who = names.length === 1 ? `${names[0]}님은` : `${names[0]}님 외 ${names.length - 1}명은`;
  return `상대 팀에도 소속된 ${who} 빼고 넣었어요. 이 경기에 우리 팀으로 뛰면 아래에서 한 명씩 추가해 주세요.`;
}

/** 이 등번호를 이미 쓰는 명단 행의 이름. 없으면 null. */
export function findJerseyHolder(state: LineupEditorState, jerseyNumber: number): string | null {
  return state.participants.find((entry) => entry.jerseyNumber === jerseyNumber)?.displayName ?? null;
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

/** 참석자 한 명의 GK 여부를 독립적으로 토글한다. 복수 GK 선택을 허용하며,
 * 아무도 지정하지 않은 상태도 제출할 수 있다(정본 §3). */
export function setGoalkeeper(state: LineupEditorState, key: string): LineupEditorState {
  return {
    ...state,
    participants: state.participants.map((entry) =>
      entry.key === key ? { ...entry, goalkeeper: !entry.goalkeeper } : entry,
    ),
    dirty: true,
  };
}

/** 제출 전 클라이언트 사전 검증 — 서버(`team-match-lineup.service.ts#resolveEntries`)가
 * 거절하는 규칙만 옮긴다. `lineupConfig.minPlayers/maxPlayers` 는 응답에 있지만 서버가
 * 제출에서 검증하지 않으므로(Task 163, `team-match-lineup-size.integration-spec.ts`) 여기서도
 * 막지 않는다. */
export function validateLineupForSubmit(state: LineupEditorState): string[] {
  const errors: string[] = [];
  if (state.participants.length === 0) {
    errors.push('참석명단을 최소 한 명 이상 등록해 주세요.');
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

/** 서버의 실제 경기 상태 기반 판정을 사용자에게 설명하는 단일 지점. */
export function describeLineupPhase(
  state: V1TeamMatchLineupState,
  editable: boolean,
  lockReason: V1TeamMatchLineupLockReason,
  /** 서버 lockReason 'terminal' 은 종료·취소·보관을 한 값으로 묶는다 — 취소는 매치 상태로 가른다. */
  matchCancelled = false,
  /** 첫 기록 뒤 결과 확정 전 — 늦게 온 선수 추가만 열린다(서버 `lateAdditionAllowed`). */
  lateAdditionAllowed = false,
): { label: string; editable: boolean; helperText: string } {
  if (!editable) {
    if (lateAdditionAllowed && !matchCancelled && (lockReason === 'records_exist' || lockReason === 'active_lineups_complete')) {
      return {
        label: '경기 중 · 추가만',
        editable: false,
        helperText: '경기 기록이 시작돼 늦게 온 선수 추가만 할 수 있어요. 이미 있는 선수는 빼거나 번호를 바꿀 수 없어요.',
      };
    }
    if (matchCancelled) {
      return {
        label: `${TEAM_MATCH_CANCELLED_LABEL} · 잠김`,
        editable: false,
        helperText: '취소된 경기의 참석명단은 수정할 수 없어요.',
      };
    }
    if (lockReason === 'records_exist') {
      return {
        label: '기록 시작 · 잠김',
        editable: false,
        helperText: '득점·공동 기록 등 경기 기록이 시작되어 참석명단을 수정할 수 없어요.',
      };
    }
    if (lockReason === 'active_lineups_complete') {
      return {
        label: '명단 확정',
        editable: false,
        helperText: '진행 중인 경기의 양 팀 참석명단이 모두 제출되어 수정할 수 없어요.',
      };
    }
    if (lockReason === 'terminal') {
      return {
        label: '경기 종료 · 잠김',
        editable: false,
        helperText: '종료되거나 취소된 경기의 참석명단은 수정할 수 없어요.',
      };
    }
    return { label: '잠김', editable: false, helperText: '서버에서 편집 가능 상태를 확인할 수 없어요.' };
  }
  if (state === 'SUBMITTED' || state === 'LOCKED') {
    return {
      label: '제출 완료',
      editable: true,
      helperText: '경기 기록이 시작되기 전까지 참석명단을 수정하고 다시 제출할 수 있어요.',
    };
  }
  return { label: '초안', editable: true, helperText: '' };
}

const PUBLIC_LINEUP_LEAD_MS = 60 * 60 * 1000;

/**
 * 상대 팀에게 공개되는 시각 — 서버 정책값, 없으면(제출 전) 킥오프 1시간 전(D-02). 서버
 * `effectivePublicLineupAt` 과 같은 규칙이라 제출 전에도 언제 공개되는지 미리 말할 수 있다.
 */
export function resolvePublicLineupAt(publicLineupAt: string | null, kickoffAt: string | null | undefined): string | null {
  if (publicLineupAt !== null) return publicLineupAt;
  const kickoff = kickoffAt ? Date.parse(kickoffAt) : Number.NaN;
  return Number.isNaN(kickoff) ? null : new Date(kickoff - PUBLIC_LINEUP_LEAD_MS).toISOString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 공개 시각 표기 — 하루 안이면 '오후 8:00', 더 멀면 날짜까지 '10/7 (수) 오후 8:00'.
 * "163시간 38분 후"처럼 시간으로만 세면 며칠 뒤인지 읽히지 않는다(W2-V10).
 */
export function formatPublicationTime(publicAt: string | null, now: number): string | null {
  const time = formatKstMeridiemTime(publicAt);
  if (publicAt === null || time === null) return null;
  const sameDay = formatTournamentDateShort(publicAt) === formatTournamentDateShort(new Date(now).toISOString());
  return sameDay ? time : `${formatTournamentDateShort(publicAt)} ${time}`;
}

/** "킥오프 1시간 전(오후 8:00)에 상대 팀에게 이 명단이 공개돼요…" — 누구에게·언제(L10). */
export function describePublicationNotice(publicAt: string | null, kickoffAt: string | null | undefined, now: number): string | null {
  const time = formatPublicationTime(publicAt, now);
  if (publicAt === null || time === null) return null;
  const kickoff = kickoffAt ? Date.parse(kickoffAt) : Number.NaN;
  const when = kickoff - Date.parse(publicAt) === PUBLIC_LINEUP_LEAD_MS ? `킥오프 1시간 전(${time})` : time;
  return `${when}에 상대 팀에게 이 명단이 공개돼요. 그 전까지 상대는 제출했는지만 볼 수 있어요.`;
}

/** 공개까지 남은 시간(파란 줄) — 하루 안이면 "공개까지 4시간 3분 남았어요.", 더 멀면 날짜로. */
export function describePublicationCountdown(publicLineupAt: string | null, now: number): string | null {
  const remaining = describeRemaining(publicLineupAt, now);
  if (remaining === undefined) return null;
  if (remaining === null) return '상대 팀에게 공개됐어요.';
  if (remaining === 'days') return `${formatPublicationTime(publicLineupAt, now)}에 공개돼요.`;
  return `공개까지 ${remaining} 남았어요.`;
}

/**
 * "4시간 3분" · 하루 넘게 남았으면 'days'(호출부가 날짜로 쓴다) · 이미 지났으면 null · 시각을 모르면 undefined.
 */
export function describeRemaining(targetIso: string | null, now: number): string | null | undefined {
  if (targetIso === null) return undefined;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return undefined;
  const diffMs = target - now;
  if (diffMs <= 0) return null;
  if (diffMs >= DAY_MS) return 'days';
  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

/** 막지 않는 안내 한 줄 — `emphasis` 만 굵게, `tone` 이 warn 이면 강조를 주황으로. */
export type LineupNotice = { tone: 'warn' | 'info'; before: string; emphasis: string; after: string };

/**
 * 인원 안내(L28 → B). 서버는 인원을 검증하지 않으므로(정본 §3) **막지 않고** 알리기만 한다. 설정의
 * 최대치는 한 번에 뛰는 인원일 수 있어(교체가 자유로운 친선은 7~8명 출전이 흔하다) 넘침은 참고 톤,
 * 모자람만 경고 톤이다. 범위 안이거나 설정이 없으면 null.
 */
export function describeLineupSizeNotice(count: number, config: V1LineupConfig | undefined): LineupNotice | null {
  const min = config?.minPlayers;
  const max = config?.maxPlayers;
  if (count === 0 || (min === undefined && max === undefined)) return null;
  const under = min !== undefined && count < min;
  const over = max !== undefined && count > max;
  if (!under && !over) return null;
  const range =
    min !== undefined && max !== undefined
      ? min === max ? `${min}명` : `${min}~${max}명`
      : min !== undefined ? `${min}명 이상` : `${max}명 이하`;
  return {
    tone: under ? 'warn' : 'info',
    before: `이 경기 기준 인원은 ${range}이에요 · `,
    emphasis: `지금 ${count}명`,
    after: under
      ? '이지만 그대로 제출할 수 있어요.'
      : '이지만 그대로 제출할 수 있어요. 교체로 뛸 선수까지 넣어도 돼요.',
  };
}

/** 골키퍼를 둘 이상 지정했을 때 같은 톤의 한 줄(L28 → B). 한 명 이하면 null. */
export function describeGoalkeeperNotice(goalkeepers: number): LineupNotice | null {
  if (goalkeepers < 2) return null;
  return {
    tone: 'info',
    before: '골키퍼를 ',
    emphasis: `${goalkeepers}명`,
    after: ' 지정했어요 · 번갈아 맡는다면 그대로 제출할 수 있어요.',
  };
}
