export type CrossGroupTeam = {
  registrationId: string; teamName: string; groupId: string; groupName: string;
  points: number; goalsFor: number; goalsAgainst: number;
};
export type CrossGroupRank = { groupId: string; groupName: string; rank: number; candidates: string[] };
export type CrossGroupTarget = {
  seed: number; label: string; fixtureId: string; side: 'HOME' | 'AWAY';
  slotId: string | null; currentRegistrationId: string | null; byePosition: number | null; groupId: string;
};
export type CrossGroupPreview = { version: string; teams: CrossGroupTeam[]; ranks: CrossGroupRank[]; targets: CrossGroupTarget[] };
export type CrossGroupApplyInput = {
  version: string; rankPicks: string[]; rankingOrder: string[]; assignments: string[]; reason: string;
};
