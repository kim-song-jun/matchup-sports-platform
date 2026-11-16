export type StageSource = { poolKey: string; rank: number; comparisonPoolKeys?: string[]; comparisonPosition?: number };
export type StagePool = { key: string; name: string; format: 'league' | 'knockout'; capacity: number; legs: 1 | 2; sources: StageSource[]; thirdPlace?: boolean; overallRankStart?: number; seeding?: 'fixed' | 'cross_group_top_three'; sixTeamFinalBye?: boolean; sixTeamDirectFinalOrder?: Array<'goals_for' | 'goal_difference' | 'fewest_goals_against'> };
export type CompetitionStage = { key: string; name: string; pools: StagePool[] };
export type StagePlan = { version: 1; stages: CompetitionStage[]; autoAdvance?: boolean };
export type StagePoolView = StagePool & {
  stageKey: string; stageName: string; stageIndex: number; generated: boolean; assigned: boolean; complete: boolean; stale: boolean; started: boolean;
  sourceVersion: string; candidates: string[][]; registrationIds: Array<string | null>; fixtureIds: string[];
  slots: Array<{ id: string; position: number; registrationId: string | null }>;
  removedFixtures?: Array<{ id: string; round: string; fixtureNumber: number }>;
  sixTeam?: { sourceVersion: string; ready: boolean; candidates: string[]; automaticBye: string | null; bye: string | null; manual: boolean; needsReview: boolean; semifinalReady: boolean; finalReady: boolean };
  standings: Array<{ registrationId: string; position: number | null; points: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number }>;
};
export type StagePlanView = { revision: number; config: StagePlan; pools: StagePoolView[]; registrations: Array<{ id: string; team: { name: string } }> };
