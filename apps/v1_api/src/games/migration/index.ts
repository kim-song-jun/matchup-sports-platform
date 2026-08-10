export {
  compareGameResultReads,
  computeGameBackfillHashes,
  runGameResultBackfill,
  runGameResultBackfillEvidence,
} from './game-result-backfill';
export type {
  GameBackfillEvidence,
  GameBackfillHashes,
  GameBackfillQuarantine,
  GameBackfillRunResult,
} from './game-result-backfill';
export { runGamePeriodLiveBackfill } from './game-period-live-backfill';
export type { GamePeriodLiveBackfillResult } from './game-period-live-backfill';
export { planGameGoalEvents, runGoalEventBackfill } from './goal-event-backfill';
export type {
  GameGoalCandidate,
  GoalEventBackfillCounts,
  GoalEventBackfillQuarantine,
  GoalEventBackfillQuarantineReason,
  GoalEventBackfillResult,
  GoalEventInsert,
} from './goal-event-backfill';
export {
  compareGameResultSnapshots,
  evaluateConsecutiveZeroGate,
  GameReadAuthorityMismatchError,
  selectGameReadAuthority,
} from './compare-game-result-reads';
export type {
  GameResultComparison,
  GameResultEntityType,
  GameResultMismatch,
} from './compare-game-result-reads';
export { runTeamRecordFactsBackfill } from './team-record-facts-backfill';
export type {
  TeamRecordFactsBackfillCounts,
  TeamRecordFactsBackfillQuarantine,
  TeamRecordFactsBackfillQuarantineReason,
  TeamRecordFactsBackfillResult,
} from './team-record-facts-backfill';
