export type StageSource = { poolKey: string; rank: number };
export type StagePool = { key: string; name: string; format: 'league' | 'knockout'; capacity: number; legs: 1 | 2; sources: StageSource[] };
export type CompetitionStage = { key: string; name: string; pools: StagePool[] };
export type StagePlan = { version: 1; stages: CompetitionStage[] };
export type StagePoolView = StagePool & {
  stageKey: string; stageName: string; stageIndex: number; generated: boolean; assigned: boolean; complete: boolean; stale: boolean; started: boolean;
  sourceVersion: string; candidates: string[][]; registrationIds: Array<string | null>; fixtureIds: string[];
  slots: Array<{ id: string; position: number; registrationId: string | null }>;
  standings: Array<{ registrationId: string; position: number | null; points: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number }>;
};
export type StagePlanView = { revision: number; config: StagePlan; pools: StagePoolView[]; registrations: Array<{ id: string; team: { name: string } }> };
