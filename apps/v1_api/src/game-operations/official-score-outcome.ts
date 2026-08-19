import type { OfficialScore } from './game-result-official-projection.types';

export type OfficialRecordResult = 'WON' | 'DRAWN' | 'LOST';
export type OfficialSideKey = 'HOME' | 'AWAY';

/**
 * 정규시간 득실과 최종 승패를 분리한다. 승부차기 득점은 공식 득실에 합산하지
 * 않지만, 정규시간이 동점이고 승부차기가 결판났다면 전적은 반드시 승/패다.
 */
export function officialRecordResult(
  score: OfficialScore,
  sideKey: OfficialSideKey,
): OfficialRecordResult {
  const ownRegulation = sideKey === 'HOME' ? score.home : score.away;
  const opponentRegulation = sideKey === 'HOME' ? score.away : score.home;
  if (ownRegulation > opponentRegulation) return 'WON';
  if (ownRegulation < opponentRegulation) return 'LOST';

  const penalties = score.penalties;
  if (penalties === undefined) return 'DRAWN';
  const ownPenalty = sideKey === 'HOME' ? penalties.home : penalties.away;
  const opponentPenalty = sideKey === 'HOME' ? penalties.away : penalties.home;
  if (ownPenalty > opponentPenalty) return 'WON';
  if (ownPenalty < opponentPenalty) return 'LOST';
  return 'DRAWN';
}
