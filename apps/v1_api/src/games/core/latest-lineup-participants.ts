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

export function selectLatestLineupParticipants<T extends LineupRevisionParticipant>(
  participants: readonly T[],
  lineups: readonly LineupRevision[],
): T[] {
  // DRAFT 인 리비전은 "최신"을 다투는 후보에서 통째로 빠진다 -- 그 사이드의 실제 최신
  // *운영 가능* 리비전(예: 정정 요청 이전의 SUBMITTED 리비전)이 대신 뽑힌다.
  const operableLineups = lineups.filter((lineup) => OPERABLE_LINEUP_STATES.has(lineup.state));
  const latestRevisionBySide = new Map<string, number>();
  const lineupById = new Map(operableLineups.map((lineup) => [lineup.id, lineup]));
  for (const lineup of operableLineups) {
    const latest = latestRevisionBySide.get(lineup.sideId) ?? 0;
    latestRevisionBySide.set(lineup.sideId, Math.max(latest, lineup.revision));
  }
  return participants.filter((participant) => {
    // `undefined === undefined` 로 통과시키지 않는다. 라인업을 한 건도 못 찾은 경우
    // (`lineups` 가 비었거나 participant 가 사라진/운영 불가 라인업을 가리키는 경우)
    // 양쪽이 모두 undefined 라 그냥 비교하면 **필터가 아무것도 거르지 않고 전원을
    // 통과시킨다** -- 이 함수를 붙인 이유(옛 리비전 선수가 공식 기록에 남는 것)와
    // 정반대 결과가 된다. 최신 리비전을 확정할 수 없으면 그 participant 는 공식
    // 스냅샷에 넣지 않는다.
    const participantRevision = lineupById.get(participant.lineupId)?.revision;
    if (participantRevision === undefined) return false;
    return participantRevision === latestRevisionBySide.get(participant.sideId);
  });
}
