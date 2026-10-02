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
  isFreeEntry = false,
}: {
  tournamentId: string;
  registrationId: string;
  minPlayers: number;
  maxPlayers: number;
  /** 참가비 0원이면 입금이라는 절차가 없다 — 문구에서 결제를 빼야 한다. 기본값은 기존 동작. */
  isFreeEntry?: boolean;
}): TournamentRosterNextStep {
  return {
    title: '선수 명단을 이어서 등록해요',
    // 무료 대회에 "입금 확인을 기다리는 동안" 이라고 하면 없는 절차를 기다리게 만든다.
    body: isFreeEntry
      ? `이제 선수 명단을 채워 주세요. 최소 ${minPlayers}명 이상 등록해야 운영진 검토가 매끄러워요.`
      : `입금 확인을 기다리는 동안 선수 명단을 먼저 채울 수 있어요. 최소 ${minPlayers}명 이상 등록해야 운영진 검토가 매끄러워요.`,
    rosterRangeLabel: `선수단 ${minPlayers}~${maxPlayers}명`,
    ctaLabel: '선수 명단 등록',
    href: `/tournaments/${tournamentId}/registrations/${registrationId}/roster`,
  };
}
