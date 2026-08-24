import { V1GameResultRevisionState } from '@prisma/client';

/**
 * 어드민 대진 표가 보여주는 "결과 진행 단계".
 *
 * 대진 표는 지금까지 팀매치 `status`(matched/cancelled/completed)만 보여줬는데, 그 값은
 * **결과가 어디까지 왔는지를 전혀 말해 주지 않는다** — 운영자가 "어느 경기가 아직 결과가
 * 없고, 어느 경기가 상대팀 승인을 기다리는지"를 화면에서 알 방법이 없었다. 리그가 조용히
 * 멈춰도 운영자는 그 사실 자체를 모른다.
 *
 * 판정 근거는 팀매치가 아니라 경기(Game)에 있다:
 * - 확정본은 `V1Game.currentOfficialRevisionId` — 이게 있으면 무조건 확정이다(가장 강한 신호).
 * - 진행 중인 것은 **최신 리비전**의 state. 예전 리비전은 승계돼도 state 가 그대로 남으므로
 *   반드시 최신 1건만 본다.
 */
export type LeagueFixtureResultStage =
  | 'not_entered'
  | 'draft'
  | 'awaiting_approval'
  | 'change_requested'
  | 'official'
  | 'voided';

export interface LeagueFixtureResultSource {
  currentOfficialRevisionId: string | null;
  /** 최신 리비전 1건(revision 내림차순). 없으면 빈 배열. */
  resultRevisions: ReadonlyArray<{ state: V1GameResultRevisionState }>;
}

export function resolveResultStage(game: LeagueFixtureResultSource | null): LeagueFixtureResultStage {
  // 대진에는 항상 경기가 붙지만(생성 시 함께 만든다), 방어적으로 null 을 미입력으로 읽는다.
  if (game === null) return 'not_entered';
  if (game.currentOfficialRevisionId !== null) return 'official';
  const latest = game.resultRevisions[0];
  if (latest === undefined) return 'not_entered';
  switch (latest.state) {
    case V1GameResultRevisionState.DRAFT:
      return 'draft';
    case V1GameResultRevisionState.SUBMITTED:
      return 'awaiting_approval';
    // 정정 요청·반려·보완 요청은 운영자에게 같은 뜻이다 — "공이 홈팀에게 돌아가 있다".
    // 셋을 따로 표시해도 운영자가 취할 행동이 달라지지 않아 한 단계로 묶는다.
    case V1GameResultRevisionState.CHANGE_REQUESTED:
    case V1GameResultRevisionState.REJECTED:
    case V1GameResultRevisionState.SUPPLEMENT_REQUESTED:
      return 'change_requested';
    // 확정본이 무효화된 경우. currentOfficialRevisionId 가 이미 풀린 뒤라 위에서 안 걸린다.
    case V1GameResultRevisionState.VOID:
      return 'voided';
    // OFFICIAL 인데 currentOfficialRevisionId 가 비어 있는 것은 정상 상태가 아니다.
    // 확정으로 읽으면 운영자가 "끝난 경기"로 오해하므로, 손이 필요한 쪽으로 읽는다.
    case V1GameResultRevisionState.OFFICIAL:
      return 'change_requested';
  }
}
