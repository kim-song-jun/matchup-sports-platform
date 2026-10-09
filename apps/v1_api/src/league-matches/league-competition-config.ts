import { ConflictException } from '@nestjs/common';

/**
 * The config version a league's fixtures are timed and pinned against: the league's own
 * (edited via period settings), not the sport-wide default. The league mirror always sets it,
 * so null means a corrupted row and is rejected rather than silently defaulted.
 */
export function leagueCompetitionConfig(league: { competitionConfigVersionId: string | null }): { id: string } {
  if (league.competitionConfigVersionId === null) {
    throw new ConflictException({
      code: 'COMPETITION_CONFIG_REQUIRED',
      message: '이 리그에 연결된 경기 설정이 없어요.',
    });
  }
  return { id: league.competitionConfigVersionId };
}
