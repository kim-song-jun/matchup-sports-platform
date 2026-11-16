import type { Prisma } from '@prisma/client';
import { rankSixTeamWinners, type SixTeamResult } from '../six-team/six-team-state';
import { createHash } from 'node:crypto';
import { resolveSixTeamDirectFinalOrder } from '../competition-config/tournament-tie-break-order';
import { replaceRankedBracketAssignments } from '../../game-operations/tournament-team-match-advancement';
import type { StoredStagePlan } from './stage-view';

export type StageSixSelection = { bye: string | null; sourceVersion: string; manual: boolean; reason: string };
export function stageSixTeamView(results: SixTeamResult[], selection?: StageSixSelection, storedOrder?: unknown) {
  const order = resolveSixTeamDirectFinalOrder(storedOrder);
  const sources = results.slice(0, 3), sourceVersion = createHash('sha256').update(JSON.stringify({ sources, order })).digest('hex'), ranked = rankSixTeamWinners(sources, {}, order);
  const needsReview = Boolean(selection?.manual && selection.sourceVersion !== sourceVersion);
  const bye = selection?.manual ? selection.bye : ranked.automaticBye;
  const remaining = ranked.ready && bye ? sources.flatMap(result => rankSixTeamWinners([result], {}).candidates.map(row => row.registrationId)).filter(id => id !== bye) : [];
  const semifinalWinner = results[3] ? rankSixTeamWinners([results[3]], {}).candidates[0]?.registrationId ?? null : null;
  const ready = ranked.ready && ranked.comparable;
  const semifinalReady = ready && Boolean(bye) && !needsReview && remaining.length === 2 && results[3]?.homeRegistrationId === remaining[0] && results[3]?.awayRegistrationId === remaining[1];
  const finalReady = semifinalReady && Boolean(results[3]?.revisionId) && remaining.includes(semifinalWinner ?? '') && results[4]?.homeRegistrationId === bye && results[4]?.awayRegistrationId === semifinalWinner;
  return { rounds: results.map(result => result.id), sourceVersion, ready, candidates: ranked.candidates.map(row => row.registrationId), automaticBye: ranked.automaticBye, bye, manual: selection?.manual === true, needsReview, semifinalReady, finalReady };
}
export async function stageSixResults(tx: Prisma.TransactionClient, tournamentId: string, poolKey: string): Promise<SixTeamResult[]> {
  const rows = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { poolKey }, teamMatch: { deletedAt: null } }, orderBy: { fixtureNumber: 'asc' }, include: { group: { select: { phase: true } }, teamMatch: { select: { game: { select: { currentOfficialRevisionId: true, currentOfficialRevision: { select: { state: true, score: true } } } } } } } });
  const ordered = [...rows.filter(row => row.group?.phase === 'quarter'), ...rows.filter(row => row.group?.phase === 'semi'), ...rows.filter(row => row.group?.phase === 'final')];
  return ordered.map(row => ({ id: row.teamMatchId, homeRegistrationId: row.homeRegistrationId, awayRegistrationId: row.awayRegistrationId, revisionId: row.teamMatch.game?.currentOfficialRevision?.state === 'OFFICIAL' ? row.teamMatch.game.currentOfficialRevisionId : null, score: row.teamMatch.game?.currentOfficialRevision?.state === 'OFFICIAL' ? row.teamMatch.game.currentOfficialRevision.score : null }));
}
export async function syncStageSixTeamsInTx(tx: Prisma.TransactionClient, tournamentId: string, plan: StoredStagePlan) {
  let changed = false;
  for (const pool of plan.stages.flatMap(stage => stage.pools).filter(pool => pool.sixTeamFinalBye)) {
    const results = await stageSixResults(tx, tournamentId, pool.key);
    if (results.length !== 5) continue;
    const selection = plan.sixTeamSelections?.[pool.key], view = stageSixTeamView(results, selection, pool.sixTeamDirectFinalOrder);
    if (view.needsReview) continue;
    const remaining = view.ready && view.bye ? results.slice(0, 3).flatMap(result => rankSixTeamWinners([result], {}).candidates.map(candidate => candidate.registrationId)).filter(id => id !== view.bye) : [];
    const semifinalWinner = rankSixTeamWinners([results[3]], {}).candidates[0]?.registrationId ?? null;
    const desired = [{ fixtureId: results[3].id, home: remaining[0] ?? null, away: remaining[1] ?? null }, { fixtureId: results[4].id, home: view.ready ? view.bye : null, away: semifinalWinner && remaining.includes(semifinalWinner) ? semifinalWinner : null }];
    if (desired.some((row, i) => row.home !== results[i + 3].homeRegistrationId || row.away !== results[i + 3].awayRegistrationId)) {
      await replaceRankedBracketAssignments(tx, tournamentId, desired);
      changed = true;
    }
    const next = selection?.manual ? selection : { bye: view.bye, sourceVersion: view.sourceVersion, manual: false, reason: '6강 공식 결과 비교' };
    if (JSON.stringify(selection) !== JSON.stringify(next)) { plan.sixTeamSelections = { ...plan.sixTeamSelections, [pool.key]: next }; changed = true; }
  }
  return changed;
}
