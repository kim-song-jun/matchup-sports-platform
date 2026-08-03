import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import * as path from 'node:path';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 12 — T1 regression: "No included test boots the actual worker composition root or proves
 * handler registration, so the reminder handler could be unregistered and every test would still
 * pass."
 *
 * schedule-reminder.service.spec.ts (unit) constructs `ScheduleReminderService` directly and
 * feeds it a hand-built claim/tx — it never imports v1-game-operations-worker.main.ts or
 * V1GameOperationsWorkerModule, so it cannot detect: the main.ts registration calls being deleted,
 * the two handlers being swapped, worker DI failing to resolve (e.g. WorkerNotificationsModule
 * being dropped), or the real HTTP RealtimeModule/GamesModule being accidentally reachable again
 * (which would crash-loop the worker under NODE_ENV=production with no FRONTEND_URL — see
 * v1-game-operations-worker.module.ts's docblock).
 *
 * This spec closes that gap by actually spawning the real entry point
 * (v1-game-operations-worker.main.ts) as a child process, under exactly the worker's real
 * production environment shape (DATABASE_URL, NODE_ENV=production, WORKER_PORT, no FRONTEND_URL),
 * then proving end-to-end that BOTH real outbox event types dispatch to the correct handler and
 * durably persist a notification — through the actual composition root, not a hand-constructed
 * instance. `worker.run()` never returns on its own (it is a daemon loop), so this test manages
 * the child process's lifecycle explicitly: spawn, poll its real HTTP health endpoint, poll the
 * DB for real outbox completion, then SIGTERM (SIGKILL fallback) before the suite ends.
 */

const ids = {
  team: '6f000000-0000-4000-8000-000000000020',
  sport: '6f000000-0000-4000-8000-000000000010',
  region: '6f000000-0000-4000-8000-000000000011',
  owner: '6f000000-0000-4000-8000-000000000001',
  memberA: '6f000000-0000-4000-8000-000000000002',
  memberB: '6f000000-0000-4000-8000-000000000003',
} as const;

const prisma = new PrismaService();
const v1ApiRoot = path.resolve(__dirname, '../..');

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a free port for the worker health check'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/game-operations-worker/health`);
      if (res.status === 200) {
        // The worker app never registers TransformInterceptor (see v1-game-operations-worker.main.ts —
        // no useGlobalInterceptors() call), so this body is the raw getHealth() object, not the
        // HTTP app's usual {status,data,timestamp} envelope.
        const body = (await res.json()) as { registeredHandlers?: number };
        // 4 built-in Task 9 handlers + 2 durable-audit handlers (main.ts) = 6 WITHOUT the two
        // Task 12 reminder handlers. Requiring exactly 8 (not merely ">= 6") is what actually
        // proves both reminder handlers registered — a regression that deletes their
        // registerHandler() calls in main.ts would stall this at 6 forever, timing out below
        // instead of silently passing.
        if ((body.registeredHandlers ?? 0) >= 8) return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Worker health endpoint never became ready on port ${port}: ${String(lastError)}`);
}

async function waitForOutboxCompletion(businessKey: string, timeoutMs: number): Promise<{ id: string; status: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ id: string; status: string; lastError: string | null }>>`
      SELECT id, status::text AS status, last_error AS "lastError"
      FROM v1_outbox_events WHERE business_key = ${businessKey}
    `;
    if (row?.status === 'COMPLETED') return row;
    if (row?.status === 'POISONED') {
      throw new Error(`Outbox event ${businessKey} was POISONED instead of completing: ${row.lastError}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Outbox event ${businessKey} never reached COMPLETED within ${timeoutMs}ms`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

describe('Task 12 reminders — real worker composition root (T1 regression)', () => {
  let child: ChildProcess | undefined;
  let port: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the T1 worker-wiring verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.owner, ids.memberA, ids.memberB].map((id) => ({
        id,
        email: `${id}@example.test`,
        phone: `010${id.slice(-8)}`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task12-reminder-worker-wiring-football' },
      update: {},
      create: { id: ids.sport, code: 'task12-reminder-worker-wiring-football', name: 'Task 12 Reminder Worker Wiring Football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK12_REMINDER_WORKER_REGION', name: 'Task 12 Reminder Worker Region', level: 2 },
    });
    await prisma.v1Team.create({
      data: { id: ids.team, ownerUserId: ids.owner, sportId: sport.id, regionId: ids.region, name: 'Task 12 Reminder Worker Team' },
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' },
        { teamId: ids.team, userId: ids.memberA, role: 'member', status: 'active' },
        { teamId: ids.team, userId: ids.memberB, role: 'member', status: 'active' },
      ],
    });

    port = await getFreePort();

    // Real production-shaped environment: no FRONTEND_URL (the worker's actual alpha container
    // env — see V1GameOperationsWorkerModule's docblock). If a regression ever reintroduces
    // RealtimeModule/GamesModule into this worker's import graph, the process crashes at
    // module-load time under this exact env, and waitForHealth() below times out — that failure
    // path doubles as a live-process B1/B2 regression guard, complementing (not replacing) the
    // static reflection test in v1-game-operations-worker.module.spec.ts.
    // Explicit NodeJS.ProcessEnv annotation is required here: TypeScript's inferred type for an
    // object-literal spread of process.env collapses to just the two added literal keys
    // (NODE_ENV/WORKER_PORT), discarding ProcessEnv's index signature — so `env.FRONTEND_URL`
    // below would otherwise fail to type-check with "Property 'FRONTEND_URL' does not exist".
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', WORKER_PORT: String(port) };
    delete env.FRONTEND_URL;

    child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/jobs/v1-game-operations-worker.main.ts'], {
      cwd: v1ApiRoot,
      env,
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        // eslint-disable-next-line no-console
        console.error(`v1 game operations worker (T1 spec) exited early: code=${code} signal=${signal}\n${stderr}`);
      }
    });

    await waitForHealth(port, 35_000);
  }, 40_000);

  afterAll(async () => {
    if (child) await stopChild(child);
    await prisma.$disconnect();
  });

  it(
    'boots the real composition root and dispatches both real reminder event types through the ' +
      'actual registered handlers, durably persisting the correct notification for each',
    async () => {
      const scheduleId = randomUUID();
      const recruitmentId = randomUUID();
      await prisma.v1TeamSchedule.create({
        data: {
          id: scheduleId,
          teamId: ids.team,
          title: 'Task 12 real worker wiring fixture',
          type: 'TRAINING',
          startAt: new Date('2026-09-10T10:00:00.000Z'),
          endAt: new Date('2026-09-10T12:00:00.000Z'),
          timezone: 'Asia/Seoul',
          state: 'SCHEDULED',
          rsvpDeadlineAt: new Date(Date.now() + 60 * 60 * 1_000),
        },
      });
      await prisma.v1ScheduleGuestRecruitment.create({
        data: {
          id: recruitmentId,
          scheduleId,
          slots: 2,
          closesAt: new Date(Date.now() + 60 * 60 * 1_000),
          state: 'OPEN',
        },
      });

      const rsvpOutboxId = randomUUID();
      const rsvpBusinessKey = `t1-wiring:${scheduleId}:rsvp:${randomUUID()}`;
      const guestOutboxId = randomUUID();
      const guestBusinessKey = `t1-wiring:${scheduleId}:guest:${randomUUID()}`;

      // Real outbox rows, inserted exactly like TeamSchedulesService.triggerReminder() does —
      // this is the ONLY thing the test constructs; everything downstream (claiming, handler
      // dispatch, transaction, completion) runs through the real, running worker process.
      await prisma.$executeRaw`
        INSERT INTO v1_outbox_events (
          id, business_key, aggregate_type, aggregate_id, type, payload,
          available_at, status, attempts, retry_generation, version, created_at, updated_at
        ) VALUES (
          ${rsvpOutboxId}, ${rsvpBusinessKey}, 'V1_TEAM_SCHEDULE', ${scheduleId},
          'SCHEDULE_RSVP_DEADLINE_REMINDER',
          ${JSON.stringify({ scheduleId, kind: 'rsvp_deadline' })}::jsonb,
          CURRENT_TIMESTAMP, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
      await prisma.$executeRaw`
        INSERT INTO v1_outbox_events (
          id, business_key, aggregate_type, aggregate_id, type, payload,
          available_at, status, attempts, retry_generation, version, created_at, updated_at
        ) VALUES (
          ${guestOutboxId}, ${guestBusinessKey}, 'V1_TEAM_SCHEDULE', ${scheduleId},
          'SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER',
          ${JSON.stringify({ scheduleId, kind: 'guest_recruitment_close' })}::jsonb,
          CURRENT_TIMESTAMP, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;

      await waitForOutboxCompletion(rsvpBusinessKey, 20_000);
      await waitForOutboxCompletion(guestBusinessKey, 20_000);

      // Both real members must have received the CORRECT event's notification — proving the
      // outbox `type` column dispatched to the matching handler, not a swapped/wrong one.
      const rsvpNotifications = await prisma.v1Notification.findMany({
        where: { businessKey: { in: [`${rsvpOutboxId}:${ids.owner}`, `${rsvpOutboxId}:${ids.memberA}`, `${rsvpOutboxId}:${ids.memberB}`] } },
      });
      expect(rsvpNotifications).toHaveLength(3);
      expect(new Set(rsvpNotifications.map((n) => n.recipientUserId))).toEqual(new Set([ids.owner, ids.memberA, ids.memberB]));
      for (const n of rsvpNotifications) {
        expect(n.title).toBe('참석 여부를 알려주세요');
        expect(n.targetType).toBe('team');
        expect(n.deepLink).toBe(`/teams/${ids.team}/schedules/${scheduleId}`);
      }

      const guestNotifications = await prisma.v1Notification.findMany({
        where: { businessKey: { in: [`${guestOutboxId}:${ids.owner}`, `${guestOutboxId}:${ids.memberA}`, `${guestOutboxId}:${ids.memberB}`] } },
      });
      expect(guestNotifications).toHaveLength(3);
      for (const n of guestNotifications) {
        expect(n.title).toBe('용병 모집이 곧 마감돼요');
      }

      // W1's "execute the same claim twice -> exactly one durable row per recipient" guarantee,
      // proven against the REAL running worker (not a mock): reset the already-COMPLETED RSVP
      // outbox row back to PENDING (simulating an operational re-delivery/forced replay of the
      // same outbox id) and let the live worker re-claim and re-run it.
      // `v1_outbox_version_cas` (a BEFORE UPDATE trigger on v1_outbox_events, migration
      // 20260729000100 line 376) raises 40001 'version compare-and-swap required' unless every
      // UPDATE sets version = OLD.version + 1. The production claim/complete paths already do this;
      // this operational-replay simulation must obey the same contract rather than bypass it.
      await prisma.$executeRaw`
        UPDATE v1_outbox_events
        SET status = 'PENDING'::"V1OutboxStatus", lease_owner = NULL, lease_until = NULL, available_at = CURRENT_TIMESTAMP, version = version + 1
        WHERE id = ${rsvpOutboxId}
      `;
      await waitForOutboxCompletion(rsvpBusinessKey, 20_000);

      const rsvpNotificationsAfterReplay = await prisma.v1Notification.findMany({
        where: { businessKey: { in: [`${rsvpOutboxId}:${ids.owner}`, `${rsvpOutboxId}:${ids.memberA}`, `${rsvpOutboxId}:${ids.memberB}`] } },
      });
      expect(rsvpNotificationsAfterReplay).toHaveLength(3);
    },
    75_000,
  );
});
