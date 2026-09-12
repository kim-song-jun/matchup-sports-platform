import { Prisma, V1GameSourceType } from '@prisma/client';

/**
 * 경기 운영 콘솔이 **이 게임이 어느 대회의 것인지**를 되찾는 단일 경로.
 *
 * Phase 3에서는 TeamMatch.tournamentId와 1:1 TournamentMatchDetails로 공식
 * 대회 경기 소유권을 판단한다. Details가 있으면 보존한 UUID를 운영자 담당
 * 경기 범위로 전달한다. 정규 리그는 통합 축에서 `tournamentId === leagueId`인
 * TeamMatch이고 Details가 없으므로 그 정합성만으로 허용한다. 친선과 소유권이
 * 어긋난 행은 해석하지 않는다.
 */
export type ResolvedGameSource = {
  readonly kind: 'teamMatch'; readonly tournamentId: string; readonly fixtureId: string;
  readonly fieldId: string | null; readonly teamMatchId: string;
};

/** 해석에 필요한 최소 게임 필드 — 호출자가 이미 잠근 행에서 그대로 넘긴다. */
export interface GameSourceRef {
  readonly sourceType: V1GameSourceType;
  readonly teamMatchId: string | null;
}

/**
 * 해석할 수 없으면 `null` — 호출자가 404 로 바꾼다.
 *
 * 해석 못 하는 경우는 셋이다: ① 대진 행이 사라졌다 ② 팀 매치 행이 사라졌다
 * ③ **리그에 속하지 않은 친선 팀 매치**다. ③은 오류가 아니라 "콘솔이 다룰 대상이
 * 아니다" — 친선 경기는 대회 운영 권한 체계 밖이므로 여기서 열리면 안 된다.
 */
export async function resolveGameSource(
  tx: Prisma.TransactionClient,
  game: GameSourceRef,
): Promise<ResolvedGameSource | null> {
  // ⚠️ **fail-open 을 만들지 않는다.** "대회 대진이 아니면 전부 팀매치" 로 두면 enum 에
  // 이미 있는 `COMPETITION_FIXTURE`·`FRIENDLY_MATCH`(R1 expand 로 추가된 통합 후 이름)와
  // 앞으로 늘어날 값까지 조용히 팀매치로 해석한다 — 그 경기들엔 운영 규칙이 다르게 걸린다
  // (예: takeover 요구 여부). 아는 값만 통과시키고 나머지는 호출부가 404 로 닫는다.
  if (game.sourceType !== V1GameSourceType.TEAM_MATCH) return null;
  if (game.teamMatchId === null) return null;
  const teamMatch = await tx.v1TeamMatch.findUnique({
    where: { id: game.teamMatchId, deletedAt: null },
    select: {
      id: true,
      tournamentId: true,
      leagueId: true,
      fieldId: true,
      tournament: { select: { kind: true } },
      tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
    },
  });
  if (teamMatch === null) return null;
  const tournamentId = teamMatch.tournamentId;
  if (!tournamentId) return null;
  const details = teamMatch.tournamentDetails;
  const isRegularLeague = teamMatch.leagueId === tournamentId
    && teamMatch.tournament?.kind === 'regular_league'
    && details === null;
  const isCanonicalTournament = details !== null
    && teamMatch.leagueId === null
    && (teamMatch.tournament?.kind === 'regular_tournament' || teamMatch.tournament?.kind === null)
    && details.tournamentId === tournamentId
    && details.teamMatchId === game.teamMatchId;
  if (!isRegularLeague && !isCanonicalTournament) return null;
  return {
    kind: 'teamMatch',
    tournamentId,
    // The original fixture UUID remains the staff scope ID after migration.
    fixtureId: teamMatch.id,
    fieldId: teamMatch.fieldId,
    teamMatchId: game.teamMatchId,
  };
}
