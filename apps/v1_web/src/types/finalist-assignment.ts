export type FinalistTeam = { registrationId: string; teamName: string; position: number | null; points: number; goalsFor: number; goalsAgainst: number };
export type FinalistRank = { rank: number } & ({ state: 'ready'; registrationId: string } | { state: 'tied'; tiedRegistrationIds: string[] } | { state: 'group_incomplete' });
export type FinalistGroup = { id: string; name: string; advanceCount: number; complete: boolean; teams: FinalistTeam[]; ranks: FinalistRank[] };
export type FinalistTarget = { fixtureId: string; side: 'HOME' | 'AWAY'; label: string; groupId: string | null; slotId: string | null; currentRegistrationId: string | null; byePosition?: number | null; byeSortOrder?: number | null };
export type FinalistPreview = { version: string; sourceVersion?: string; standingsChanged?: boolean; groups: FinalistGroup[]; targets: FinalistTarget[]; blockedReason: string | null };
export type FinalistAssignmentInput = { version: string; reason: string; assignments: { fixtureId: string; side: 'HOME' | 'AWAY'; registrationId: string }[] };
