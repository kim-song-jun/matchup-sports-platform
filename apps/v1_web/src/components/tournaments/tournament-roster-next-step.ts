export type TournamentRosterNextStep = {
  title: string;
  body: string;
  rosterRangeLabel: string;
  ctaLabel: string;
  href: string;
};

export function getTournamentRosterNextStep({
  tournamentId,
  registrationId,
  minPlayers,
  maxPlayers,
}: {
  tournamentId: string;
  registrationId: string;
  minPlayers: number;
  maxPlayers: number;
}): TournamentRosterNextStep {
  return {
    title: '선수 명단을 이어서 등록해요',
    body: `입금 확인을 기다리는 동안 선수 명단을 먼저 채울 수 있어요. 최소 ${minPlayers}명 이상 등록해야 운영진 검토가 매끄러워요.`,
    rosterRangeLabel: `선수단 ${minPlayers}~${maxPlayers}명`,
    ctaLabel: '선수 명단 등록',
    href: `/tournaments/${tournamentId}/registrations/${registrationId}/roster`,
  };
}
