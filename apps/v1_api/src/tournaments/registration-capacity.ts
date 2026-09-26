import { V1CompetitionKind } from '@prisma/client';

/**
 * 참가 신청의 **정원 상한**을 돌려준다. `null` 이면 상한이 없다 — 검사를 건너뛴다.
 *
 * ## 왜 필드를 직접 읽지 않고 이걸 지나는가
 * `V1Tournament.teamCount` 는 **이름이 정원처럼 생기지 않았는데 정원 역할을 한다.**
 * 등록 스택 다섯 자리가 전부 `reservedCount >= tournament.teamCount` 로 409
 * `TOURNAMENT_CAPACITY_FULL` 을 던진다. 그래서 "리그엔 정원이 없다" 는 결정을 지키려면
 * 그 다섯 자리를 전부 지나야 하고, 분기를 다섯 번 복사하면 **하나를 빠뜨린 경로만 조용히
 * 409** 가 된다. 한 곳으로 모은다.
 *
 * ## 리그에 상한이 없는 이유 (2026-09-03 사용자 확정)
 * 리그 거울(`kind='regular_league'`)은 `leagueMirrorCreateData` 가 `teamCount` 를 **안 넣어서**
 * 스키마 기본값 `8` 이 박혀 있다. 운영자가 고른 값이 아니라 아무도 정한 적 없는 값이다.
 * 그대로 두면 9번째 팀부터 신청이 막히고, 이미 8팀을 넘긴 리그는 **어드민 확정까지** 막힌다
 * (alpha 실측: 거울 89개 전부 `team_count=8`, 8팀 초과 1개 — 최대 10팀).
 *
 * 정규 리그는 승강제로 팀 수가 시즌마다 변하는 것이 정상이라 "대회 정원" 과 같은 개념이
 * 아니다. **진짜 리그 정원을 도입하려면** 전용 컬럼(expand) + 어드민 입력 + 화면이 한
 * 덩어리로 필요하고, 그건 별도 태스크다. 그때 이 함수가 그 컬럼을 읽는 자리가 된다 —
 * 지금 `null` 을 돌려주는 자리에 값이 생기는 것뿐이라 호출부 다섯 곳은 그대로 남는다.
 *
 * `teamCount` 자체를 리그에서 다른 값으로 덮지 않는 이유: 그건 통합 축의 **상한** 의미인데
 * 리그 축의 `teamCount` 는 **현재 등록 팀 수**(파생값)다. 같은 이름이 두 축에서 반대를
 * 뜻하므로, 한쪽 값을 다른 쪽에 넣으면 정원이 곧 현재값이 되어 새 팀이 영원히 못 들어온다.
 */
export function capacityLimitOf(competition: {
  kind: V1CompetitionKind | null;
  teamCount: number;
}): number | null {
  if (competition.kind === V1CompetitionKind.regular_league) return null;
  // `kind: null` 은 R1 이전의 옛 대회다 — 대회 쪽에 붙는다(`tournament-surface-lookup.ts`
  // 의 같은 규칙). 옛 대회의 정원이 조용히 풀리면 안 된다.
  return competition.teamCount;
}

/** `capacityLimitOf` 가 `null` 이 아니고 이미 찼는지. 상한이 없으면 항상 `false`. */
export function isCapacityFull(
  competition: { kind: V1CompetitionKind | null; teamCount: number },
  reservedCount: number,
): boolean {
  const limit = capacityLimitOf(competition);
  return limit !== null && reservedCount >= limit;
}
