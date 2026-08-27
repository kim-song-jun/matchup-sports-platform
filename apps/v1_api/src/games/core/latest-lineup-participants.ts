import { V1GameLineupState } from '@prisma/client';

export interface LineupRevisionParticipant {
  readonly sideId: string;
  readonly lineupId: string;
}

export interface LineupRevision {
  readonly id: string;
  readonly sideId: string;
  readonly revision: number;
  /**
   * 이 리비전이 "운영 가능"(제출됨 -- 공식 기록/신원 연결 후보로 실릴 자격이 있음)한지.
   * `games.service.ts`의 `assertLineupsSubmittedForStart`/`latestOperableLineup`
   * (lineup-grid.tsx)과 동일한 판정 대상이다: SUBMITTED/LOCKED 만 해당하고, 그 위에
   * 새로 얹힌 DRAFT(정정 요청으로 열렸지만 아직 재제출되지 않은 초안)는 해당하지 않는다
   * -- "새 DRAFT 리비전이 예전 제출을 무효화하지 않는다"는 뜻이다.
   *
   * **필수 필드다.** 처음에는 하위 호환을 위해 optional 로 뒀는데, 그러면 Prisma
   * `select` 에 `state: true` 를 빠뜨린 소비처가 조용히 옛 동작(리비전 번호만으로 최신
   * 판정 -- DRAFT 가 이기는 동작)으로 떨어진다. 실제로 이 함수의 소비처 4곳이 전부
   * `state` 를 안 읽고 있어서 필터가 **소비처 0건인 dead code** 였다. 필수로 바꿔
   * 새 소비처가 이 결정을 건너뛰면 컴파일이 깨지게 한다.
   */
  readonly state: V1GameLineupState;
}

const OPERABLE_LINEUP_STATES: ReadonlySet<V1GameLineupState> = new Set([
  V1GameLineupState.SUBMITTED,
  V1GameLineupState.LOCKED,
]);

/**
 * 사이드별로 "어느 리비전을 최신으로 볼 것인가"를 정한 뒤 그 리비전의 참가자만 남긴다.
 * 두 공개 셀렉터가 이 로직을 공유하고, 다른 것은 **후보 리비전을 고르는 방식**뿐이다.
 */
function pickParticipantsOfChosenRevisions<T extends LineupRevisionParticipant>(
  participants: readonly T[],
  chosen: readonly LineupRevision[],
): T[] {
  const latestRevisionBySide = new Map<string, number>();
  const lineupById = new Map(chosen.map((lineup) => [lineup.id, lineup]));
  for (const lineup of chosen) {
    const latest = latestRevisionBySide.get(lineup.sideId) ?? 0;
    latestRevisionBySide.set(lineup.sideId, Math.max(latest, lineup.revision));
  }
  return participants.filter((participant) => {
    // `undefined === undefined` 로 통과시키지 않는다. 라인업을 한 건도 못 찾은 경우
    // (`lineups` 가 비었거나 participant 가 사라진/후보 밖 라인업을 가리키는 경우)
    // 양쪽이 모두 undefined 라 그냥 비교하면 **필터가 아무것도 거르지 않고 전원을
    // 통과시킨다** -- 이 함수를 붙인 이유(옛 리비전 선수가 기록에 남는 것)와 정반대다.
    const participantRevision = lineupById.get(participant.lineupId)?.revision;
    if (participantRevision === undefined) return false;
    return participantRevision === latestRevisionBySide.get(participant.sideId);
  });
}

/**
 * **제출된 라인업만 인정한다.** 제출본이 없는 사이드는 통째로 빈다.
 *
 * 쓰는 곳은 "제출됐다는 사실 자체가 전제인" 경로뿐이다:
 * - 대회 공식 결과 스냅샷(`deriveTournamentRevision`) — 대회는 `SCHEDULED→LIVE` 게이트
 *   (`assertLineupsSubmittedForStart`)를 반드시 거치므로 종료 시점에 제출본이 항상 있다.
 * - 신원 연결 후보(`listClaimableParticipantsForGame`) — 제출 안 된 참가자를 연결하면
 *   그 participantId 가 공식 결과에 안 실려 개인 기록이 영원히 안 붙는다.
 *
 * **리그(TEAM_MATCH) 결과 입력에는 쓰지 마라.** 리그는 위 게이트를 거치지 않아
 * "종료 시점엔 제출본이 있다"가 거짓이다 — `selectLineupParticipantsWithDraftFallback` 를 쓴다.
 */
export function selectLatestLineupParticipants<T extends LineupRevisionParticipant>(
  participants: readonly T[],
  lineups: readonly LineupRevision[],
): T[] {
  // DRAFT 인 리비전은 "최신"을 다투는 후보에서 통째로 빠진다 -- 그 사이드의 실제 최신
  // *운영 가능* 리비전(예: 정정 요청 이전의 SUBMITTED 리비전)이 대신 뽑힌다.
  return pickParticipantsOfChosenRevisions(
    participants,
    lineups.filter((lineup) => OPERABLE_LINEUP_STATES.has(lineup.state)),
  );
}

/**
 * **사이드별 폴백**: 제출본(SUBMITTED/LOCKED)이 있으면 그것을, 하나도 없으면 그 사이드의
 * 최신 리비전을 상태와 무관하게 쓴다.
 *
 * 리그 결과 입력 경로가 이것을 쓴다. 리그는 팀장이 "저장"만 하고 "제출"을 안 눌러도
 * 경기가 끝나고 운영자가 결과를 넣는다(자동저장이라 이게 오히려 흔한 경로다). 엄격
 * 셀렉터를 쓰면 그 사이드가 통째로 비어서 ① 운영자의 득점자 드롭다운이 0명이 되고
 * ② 라인업을 작성한 팀조차 출전 기록이 안 쌓인다 — `loadSideRosters` 는 리비전 모양만
 * 보고 `teamAuthored=true` 로 판정하는데 참가자는 []가 되는 자기모순까지 생긴다.
 *
 * 그러면서도 원래 막으려던 것은 그대로 막는다: **제출본이 하나라도 있는 사이드**에서는
 * 그 위에 얹힌 DRAFT(정정 요청으로 재오픈된 초안)가 직전 제출을 밀어내지 못한다.
 */
export function selectLineupParticipantsWithDraftFallback<T extends LineupRevisionParticipant>(
  participants: readonly T[],
  lineups: readonly LineupRevision[],
): T[] {
  const sidesWithOperable = new Set(
    lineups.filter((lineup) => OPERABLE_LINEUP_STATES.has(lineup.state)).map((lineup) => lineup.sideId),
  );
  return pickParticipantsOfChosenRevisions(
    participants,
    // 제출본이 있는 사이드는 제출본만, 없는 사이드는 전부(=최신 DRAFT 가 뽑힌다).
    lineups.filter((lineup) =>
      sidesWithOperable.has(lineup.sideId) ? OPERABLE_LINEUP_STATES.has(lineup.state) : true,
    ),
  );
}
