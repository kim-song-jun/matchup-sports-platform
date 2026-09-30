import { fixtureDetailHref } from './fixture-detail-route';
import { gameRosterScreenPath } from './game-roster-routes';
import { withFromPath } from './session-storage';

type TeamGameKind = 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';

/**
 * 내 팀 경기 하나에서 화면으로 가는 링크. 홈 "다음 경기"와 팀 상세 "다가오는 경기"가 같은 규칙을 쓴다.
 * 링크가 팀원이 실제로 열 수 있는 화면만 가리키는 것이 이 파일의 계약이다 — 막다른 링크를 내지 않는다.
 */
export interface TeamGameLinkInput {
  readonly competitionKind: TeamGameKind;
  /** 대회 id 또는 리그 id (`V1TeamUpcomingGame.tournamentId` 가 두 경우 모두 담는다). */
  readonly competitionId: string | null;
  readonly teamMatchId: string | null;
}

/** 경기 상세. 대회·리그·친선의 라우트가 서로 다르다. 경기를 가리킬 식별자가 없으면 null. */
export function teamGameDetailHref(game: TeamGameLinkInput, fromHref?: string | null): string | null {
  if (game.teamMatchId === null) return null;
  if (game.competitionKind === 'FRIENDLY') {
    return withFromPath(`/team-matches/${encodeURIComponent(game.teamMatchId)}`, fromHref);
  }
  if (game.competitionId === null) return null;
  return fixtureDetailHref({
    isRegularLeague: game.competitionKind === 'LEAGUE',
    competitionId: game.competitionId,
    fixtureId: game.teamMatchId,
    fromHref,
  });
}

/**
 * 명단 화면. 대회·리그는 팀원 누구나 읽는 경기 명단 화면이고, 기준 명단이 없는 경기는 그 화면이 404 라
 * 링크를 내지 않는다. 친선의 참석명단은 팀장·매니저만 여는 화면(팀원은 403)이라 그 둘에게만 링크한다.
 */
export function teamGameRosterHref(
  game: TeamGameLinkInput & {
    readonly teamId: string;
    readonly gameId: string;
    readonly rosterAvailable: boolean;
    readonly canManage: boolean;
  },
): string | null {
  if (game.competitionKind === 'FRIENDLY') {
    return game.canManage && game.teamMatchId !== null ? `/team-matches/${encodeURIComponent(game.teamMatchId)}/lineup` : null;
  }
  return game.rosterAvailable ? gameRosterScreenPath(game.teamId, game.gameId) : null;
}
