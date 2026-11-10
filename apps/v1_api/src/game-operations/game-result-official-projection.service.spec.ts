import type { Prisma } from '@prisma/client';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
import { LeagueCompletionProjectionService } from '../league-matches/league-completion-projection.service';
import { GameResultBracketProjectionService } from './game-result-bracket-projection.service';
import { GameResultEscalationTerminalService } from './game-result-escalation-terminal.service';
import { GameResultOfficialFactsService } from './game-result-official-facts.service';
import { GameResultOfficialProjectionService } from './game-result-official-projection.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { GameResultProjectionWatermarkService } from './game-result-projection-watermark.service';
import { GameResultPublicCacheService } from './game-result-public-cache.service';
import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import { SuspensionNoticeProjectionService } from './suspension-notice.service';
import { TeamMatchCompletionNotificationService } from './team-match-completion-notification.service';
import { TournamentFixtureCompletionNotificationService } from './tournament-fixture-completion-notification.service';

const revision = {
  revisionId: 'revision-1',
  gameId: 'game-1',
  score: { home: 2, away: 1 },
  sourceHash: 'hash',
  tournamentId: 'tournament-1',
  homeTeamId: 'team-home',
  awayTeamId: 'team-away',
} as unknown as OfficialRevisionRow;

function mockCollaborators(isCurrent: boolean) {
  jest.spyOn(GameResultOfficialFactsService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(GameResultPublicCacheService.prototype, 'build').mockReturnValue({ isCurrent, payloadHash: 'p' } as never);
  jest.spyOn(GameResultPublicCacheService.prototype, 'repairRequired').mockResolvedValue(false);
  jest.spyOn(GameResultPublicCacheService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(GameResultProjectionWatermarkService.prototype, 'repairRequired').mockResolvedValue(false);
  jest.spyOn(GameResultProjectionWatermarkService.prototype, 'write').mockResolvedValue(undefined as never);
  jest.spyOn(GameResultBracketProjectionService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(GameResultStandingsProjectionService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(LeagueCompletionProjectionService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(TeamMatchCompletionNotificationService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(TournamentFixtureCompletionNotificationService.prototype, 'project').mockResolvedValue(undefined);
  jest.spyOn(GameResultEscalationTerminalService.prototype, 'close').mockResolvedValue(undefined);
  return jest.spyOn(SuspensionNoticeProjectionService.prototype, 'project').mockResolvedValue(undefined);
}

async function runHandler(): Promise<{ tx: Prisma.TransactionClient; claim: GameOperationClaim }> {
  const service = new GameResultOfficialProjectionService();
  jest.spyOn(service as never as { lockOfficialRevision: () => Promise<OfficialRevisionRow> }, 'lockOfficialRevision')
    .mockResolvedValue(revision);
  const tx = {} as Prisma.TransactionClient;
  const claim = { payload: { revisionId: 'revision-1' }, afterCommit: [] } as unknown as GameOperationClaim;
  await service.handler(claim, tx);
  return { tx, claim };
}

describe('GameResultOfficialProjectionService suspension notice wiring', () => {
  afterEach(() => jest.restoreAllMocks());

  it('projects the suspension notice with the same transaction and claim once the revision is current', async () => {
    const suspension = mockCollaborators(true);
    const { tx, claim } = await runHandler();
    expect(suspension).toHaveBeenCalledTimes(1);
    expect(suspension).toHaveBeenCalledWith(tx, revision, claim);
  });

  it('skips the suspension notice for a revision that is no longer the current official one', async () => {
    const suspension = mockCollaborators(false);
    await runHandler();
    expect(suspension).not.toHaveBeenCalled();
  });
});
