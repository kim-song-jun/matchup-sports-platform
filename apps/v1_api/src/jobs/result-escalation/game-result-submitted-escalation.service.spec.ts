import { GameResultSubmittedEscalationService } from './game-result-submitted-escalation.service';
import type { GameOperationClaim } from '../v1-game-operations-worker.service';

// Issue #394 follow-up regression coverage: `GamesService.syncAssistsIntoSubmittedRevision`
// (ASSIST_SYNC) can supersede a SUBMITTED revision with a fresh successor WITHOUT ever
// changing the predecessor's own `state` column away from SUBMITTED (no
// `V1GameResultRevisionState` value honestly means "auto-superseded, no reviewer
// decision" -- see that method's doc comment). Before this fix, all 3 handlers below only
// ever gated on `state === 'SUBMITTED'`, so a predecessor superseded before the worker got
// to its original GAME_RESULT_SUBMITTED event would get a brand-new PENDING escalation
// created against an id nothing will ever officialize -- a phantom nothing closes.

type RevisionRow = {
  revisionId: string;
  gameId: string;
  state: string;
  submittedAt: Date | null;
  teamMatchId: string | null;
  tournamentId: string | null;
  leagueId: string | null;
  hostTeamId: string | null;
};

function sqlOf(call: unknown[]): string {
  return (call[0] as readonly string[]).join('');
}

function claim(revisionId: string, type = 'GAME_RESULT_SUBMITTED', id = 'outbox-1'): GameOperationClaim {
  return {
    id,
    businessKey: `result-review:${revisionId}:${type}`,
    aggregateType: 'GAME',
    aggregateId: 'g1',
    revisionId,
    type,
    payload: { revisionId },
    attempts: 0,
    retryGeneration: 0,
    version: 0,
    leaseOwner: 'owner-1',
    leaseUntil: new Date(),
  };
}

/**
 * $queryRaw is dispatched by matching a distinctive substring in the query text rather than
 * by call order/position, so these tests stay correct regardless of how many times
 * `isRevisionSuperseded` happens to run per handler invocation (this fix deliberately calls
 * it redundantly -- once per handler entry, and again inside `createQueue`/
 * `scheduleDueDeliveries` -- see `guardSuperseded`'s own doc comment for why).
 */
function fakeTx(opts: {
  revisionRow: RevisionRow | undefined;
  superseded: boolean;
  reviewerRows?: Array<{ userId: string }>;
  leagueTeamRows?: Array<{ role: 'away' | 'home'; userId: string }>;
  adminRows?: Array<{ userId: string }>;
}) {
  const queryRaw = jest.fn((strings: readonly string[]) => {
    const sql = strings.join('');
    if (sql.includes('FOR UPDATE OF revision')) {
      return Promise.resolve(opts.revisionRow ? [opts.revisionRow] : []);
    }
    if (sql.includes('WHERE supersedes_id')) {
      return Promise.resolve(opts.superseded ? [{ id: 'successor-1' }] : []);
    }
    if (sql.includes("'away' AS role")) {
      return Promise.resolve(opts.leagueTeamRows ?? []);
    }
    if (sql.includes('v1_admin_users')) {
      return Promise.resolve(opts.adminRows ?? []);
    }
    if (sql.includes('v1_tournament_staff_assignments')) {
      return Promise.resolve([]);
    }
    if (sql.includes('v1_team_matches team_match')) {
      return Promise.resolve(opts.reviewerRows ?? []);
    }
    throw new Error(`Unmocked $queryRaw call: ${sql.slice(0, 120)}`);
  });
  const executeRaw = jest.fn().mockResolvedValue(1);
  return { $queryRaw: queryRaw, $executeRaw: executeRaw };
}

const submittedAt = new Date('2026-08-01T00:00:00.000Z');

function supersededRevision(overrides: Partial<RevisionRow> = {}): RevisionRow {
  return {
    revisionId: 'rev-old',
    gameId: 'g1',
    state: 'SUBMITTED',
    submittedAt,
    teamMatchId: 'tm1',
    tournamentId: null,
    leagueId: null,
    hostTeamId: null,
    ...overrides,
  };
}

describe('GameResultSubmittedEscalationService — ASSIST_SYNC supersession (#394 follow-up)', () => {
  describe('superseded revision: quiet no-op + self-heal, no retry loop', () => {
    it('handler does not create a new escalation/outbox row for a superseded revision, and self-heals any existing PENDING rows for it', async () => {
      const service = new GameResultSubmittedEscalationService();
      const tx = fakeTx({ revisionRow: supersededRevision(), superseded: true });

      await expect(service.handler(claim('rev-old'), tx as never)).resolves.toBeUndefined();

      // No INSERT was ever issued -- only the self-heal CLOSE statements ran.
      const executed = tx.$executeRaw.mock.calls.map(sqlOf);
      expect(executed).toHaveLength(2);
      expect(executed.some((sql) => sql.includes('INSERT'))).toBe(false);
      expect(executed[0]).toContain('UPDATE v1_result_escalations');
      expect(executed[0]).toContain('CLOSED');
      expect(tx.$executeRaw.mock.calls[0][1]).toBe('rev-old');
      expect(executed[1]).toContain('UPDATE v1_outbox_events');
      expect(executed[1]).toContain('COMPLETED');
      expect(tx.$executeRaw.mock.calls[1][1]).toBe('rev-old');
    });

    it('reminderHandler does not notify a reviewer about a revision that has since been superseded, and resolves without throwing', async () => {
      const service = new GameResultSubmittedEscalationService();
      const tx = fakeTx({
        revisionRow: supersededRevision({ revisionId: 'rev-old-2' }),
        superseded: true,
        reviewerRows: [{ userId: 'reviewer-1' }],
      });

      await expect(service.reminderHandler(claim('rev-old-2', 'GAME_RESULT_REVIEW_REMINDER'), tx as never)).resolves.toBeUndefined();

      // currentReviewer/notifyReviewer must never run — only the self-heal CLOSE statements.
      const executed = tx.$executeRaw.mock.calls.map(sqlOf);
      expect(executed).toHaveLength(2);
      expect(executed.some((sql) => sql.includes('v1_notifications'))).toBe(false);
    });

    it('escalationHandler does not fire the league escalation notifications for a superseded revision, and resolves without throwing', async () => {
      const service = new GameResultSubmittedEscalationService();
      const tx = fakeTx({
        revisionRow: supersededRevision({
          revisionId: 'rev-old-3',
          leagueId: 'lg1',
          teamMatchId: 'tm1',
          hostTeamId: 'home-team',
        }),
        superseded: true,
        leagueTeamRows: [{ role: 'away', userId: 'away-user' }, { role: 'home', userId: 'home-user' }],
        adminRows: [{ userId: 'admin-1' }],
      });

      await expect(service.escalationHandler(claim('rev-old-3', 'GAME_RESULT_REVIEW_ESCALATION'), tx as never)).resolves.toBeUndefined();

      const executed = tx.$executeRaw.mock.calls.map(sqlOf);
      expect(executed).toHaveLength(2);
      expect(executed.some((sql) => sql.includes('v1_notifications'))).toBe(false);
      expect(executed.some((sql) => sql.includes('INSERT INTO v1_result_escalations'))).toBe(false);
    });
  });

  describe('regression guard: non-superseded SUBMITTED revisions keep working', () => {
    it('handler still creates the REMINDER+ESCALATION queue rows, the matching outbox jobs, and notifies the reviewer when the revision has NOT been superseded', async () => {
      const service = new GameResultSubmittedEscalationService();
      const tx = fakeTx({
        revisionRow: supersededRevision({ revisionId: 'rev-live' }),
        superseded: false,
        reviewerRows: [{ userId: 'reviewer-1' }],
      });

      await service.handler(claim('rev-live'), tx as never);

      const executed = tx.$executeRaw.mock.calls.map(sqlOf);
      const escalationInsert = executed.find((sql) => sql.includes('INSERT INTO v1_result_escalations'));
      expect(escalationInsert).toBeDefined();
      expect(escalationInsert).toContain("'REMINDER'");
      expect(escalationInsert).toContain("'ESCALATION'");

      const outboxInsert = executed.find((sql) => sql.includes('INSERT INTO v1_outbox_events'));
      expect(outboxInsert).toBeDefined();
      expect(outboxInsert).toContain('GAME_RESULT_REVIEW_REMINDER');
      expect(outboxInsert).toContain('GAME_RESULT_REVIEW_ESCALATION');

      const notifyCallIndex = tx.$executeRaw.mock.calls.findIndex((call) => sqlOf(call).includes('INSERT INTO v1_notifications'));
      expect(notifyCallIndex).toBeGreaterThanOrEqual(0);
      // Value order is (id, business_key, recipient_user_id, ...) — index 1 is the random uuid, index 2 is business_key.
      expect(tx.$executeRaw.mock.calls[notifyCallIndex][2]).toBe('result-review:rev-live:submitted:recipient:reviewer-1');
    });

    it('reminderHandler still notifies the reviewer (stage=reminder) when the revision has NOT been superseded', async () => {
      const service = new GameResultSubmittedEscalationService();
      const tx = fakeTx({
        revisionRow: supersededRevision({ revisionId: 'rev-live-2' }),
        superseded: false,
        reviewerRows: [{ userId: 'reviewer-1' }],
      });

      await service.reminderHandler(claim('rev-live-2', 'GAME_RESULT_REVIEW_REMINDER'), tx as never);

      const notifyCall = tx.$executeRaw.mock.calls.find((call) => sqlOf(call).includes('INSERT INTO v1_notifications'));
      expect(notifyCall).toBeDefined();
      expect(notifyCall?.[2]).toBe('result-review:rev-live-2:reminder:recipient:reviewer-1');
    });

    it('escalationHandler still creates the series escalation row and fires league escalation notifications when the revision has NOT been superseded', async () => {
      const service = new GameResultSubmittedEscalationService();
      const tx = fakeTx({
        revisionRow: supersededRevision({
          revisionId: 'rev-live-3',
          leagueId: 'lg1',
          teamMatchId: 'tm1',
          hostTeamId: 'home-team',
        }),
        superseded: false,
        leagueTeamRows: [{ role: 'away', userId: 'away-user' }, { role: 'home', userId: 'home-user' }],
        adminRows: [{ userId: 'admin-1' }],
      });

      await service.escalationHandler(claim('rev-live-3', 'GAME_RESULT_REVIEW_ESCALATION'), tx as never);

      const executed = tx.$executeRaw.mock.calls.map(sqlOf);
      const escalationInsert = executed.find((sql) => sql.includes('INSERT INTO v1_result_escalations'));
      expect(escalationInsert).toBeDefined();
      expect(escalationInsert).toContain("'ESCALATION'");
      expect(escalationInsert).not.toContain("'REMINDER'");

      const notificationInserts = tx.$executeRaw.mock.calls.filter((call) => sqlOf(call).includes('INSERT INTO v1_notifications'));
      expect(notificationInserts).toHaveLength(3); // away + home + admin
    });
  });
});
