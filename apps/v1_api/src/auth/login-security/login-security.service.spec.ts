import { createLoginSecurityFakePrisma } from '../../../test/helpers/login-security-fake-prisma';
import { SECURITY_LOGIN_ANOMALY_TYPE } from './login-security.policy';
import { LoginSecurityService } from './login-security.service';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const minutesAgo = (minutes: number, base = NOW) => new Date(base.getTime() - minutes * 60_000);

function setup() {
  const { prisma, state } = createLoginSecurityFakePrisma();
  const service = new LoginSecurityService(prisma as never);
  const seed = (result: string, emailKey: string, createdAt: Date, ipKey: string | null = null) =>
    state.attempts.push({ id: `a-${state.attempts.length}`, emailKey, ipKey, result, createdAt });
  return { prisma, state, service, seed };
}

describe('LoginSecurityService.isStepUpRequired', () => {
  it('requires step-up at 3 failures in 15 minutes but not at 2', async () => {
    const { service, seed } = setup();
    seed('failed', 'email-a', minutesAgo(1));
    seed('failed', 'email-a', minutesAgo(2));
    expect(await service.isStepUpRequired('email-a', NOW)).toBe(false);

    seed('failed', 'email-a', minutesAgo(3));
    expect(await service.isStepUpRequired('email-a', NOW)).toBe(true);
  });

  it('counts only that email: another email with 3 failures does not step up a clean one', async () => {
    const { service, seed } = setup();
    for (const minutes of [1, 2, 3]) seed('failed', 'email-a', minutesAgo(minutes));
    seed('failed', 'email-b', minutesAgo(1));

    expect(await service.isStepUpRequired('email-a', NOW)).toBe(true);
    expect(await service.isStepUpRequired('email-b', NOW)).toBe(false);
    expect(await service.isStepUpRequired('email-c', NOW)).toBe(false);
  });

  it('releases the account streak once the failures are older than 15 minutes', async () => {
    const { service, seed } = setup();
    for (const age of [14.9, 14.95, 14.99]) seed('failed', 'email-a', minutesAgo(age));
    expect(await service.isStepUpRequired('email-a', NOW)).toBe(true);

    const later = new Date(NOW.getTime() + 2 * 60_000);
    expect(await service.isStepUpRequired('email-a', later)).toBe(false);
  });

  it('starts counting again after a completed login, and a streak after it still triggers', async () => {
    const { service, seed } = setup();
    for (const minutes of [9, 8, 7]) seed('failed', 'email-a', minutesAgo(minutes));
    seed('success', 'email-a', minutesAgo(6));
    for (const minutes of [5, 4]) seed('failed', 'email-a', minutesAgo(minutes));
    expect(await service.isStepUpRequired('email-a', NOW)).toBe(false);

    seed('failed', 'email-a', minutesAgo(3));
    expect(await service.isStepUpRequired('email-a', NOW)).toBe(true);
  });

  it('does not count a right-password step-up issue as a failure', async () => {
    const { service, seed } = setup();
    for (const minutes of [1, 2, 3]) seed('step_up_issued', 'email-a', minutesAgo(minutes));
    expect(await service.isStepUpRequired('email-a', NOW)).toBe(false);
  });

  it('requires step-up for every email while the last detection is under 30 minutes old, then stops', async () => {
    const { service, state } = setup();
    state.anomalies.push({ id: 'an-1', kind: 'login_spray', startedAt: minutesAgo(45), lastDetectedAt: minutesAgo(29.9) });
    expect(await service.isStepUpRequired('never-seen-email', NOW)).toBe(true);

    state.anomalies[0].lastDetectedAt = minutesAgo(30.1);
    expect(await service.isStepUpRequired('never-seen-email', NOW)).toBe(false);
  });
});

describe('LoginSecurityService.detectSpray', () => {
  function failures(seed: ReturnType<typeof setup>['seed'], total: number, accounts: number, ageMinutes = 1, base = NOW) {
    for (let index = 0; index < total; index += 1) {
      seed('failed', `email-${index % accounts}`, minutesAgo(ageMinutes, base), `ip-${index % 4}`);
    }
  }

  it.each([
    { total: 29, accounts: 12, label: '29 failures across 12 accounts' },
    { total: 30, accounts: 9, label: '30 failures across 9 accounts' },
  ])('does not flag $label', async ({ total, accounts }) => {
    const { service, state, seed } = setup();
    failures(seed, total, accounts);

    expect(await service.detectSpray(NOW)).toEqual({ detected: false, opened: false });
    expect(state.anomalies).toHaveLength(0);
    expect(state.outbox).toHaveLength(0);
  });

  it('flags 30 failures across 10 accounts: one anomaly with the counts and one outbox alert', async () => {
    const { service, state, seed } = setup();
    failures(seed, 30, 10);

    expect(await service.detectSpray(NOW)).toEqual({ detected: true, opened: true });
    expect(state.anomalies).toHaveLength(1);
    expect(state.anomalies[0]).toMatchObject({ kind: 'login_spray', failedCount: 30, accountCount: 10, ipCount: 4 });
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({
      type: SECURITY_LOGIN_ANOMALY_TYPE,
      aggregateType: 'SECURITY_ANOMALY',
      aggregateId: state.anomalies[0].id,
      businessKey: `security:login-anomaly:${state.anomalies[0].id}:slack`,
      payload: { failedCount: 30, accountCount: 10, ipCount: 4, windowMinutes: 10 },
    });
  });

  it('keeps one anomaly and one alert while the attack continues, only refreshing the last detection and counts', async () => {
    const { service, state, seed } = setup();
    failures(seed, 30, 10);
    await service.detectSpray(NOW);

    failures(seed, 12, 12, 0.5);
    const later = new Date(NOW.getTime() + 5 * 60_000);
    expect(await service.detectSpray(later)).toEqual({ detected: true, opened: false });

    expect(state.anomalies).toHaveLength(1);
    expect(state.outbox).toHaveLength(1);
    expect(state.anomalies[0].lastDetectedAt).toEqual(later);
    expect(state.anomalies[0].startedAt).toEqual(NOW);
    expect(state.anomalies[0]).toMatchObject({ failedCount: 42, accountCount: 12 });
  });

  it('opens a new anomaly and alert when the next attack starts more than 30 minutes after the last detection', async () => {
    const { service, state, seed } = setup();
    failures(seed, 30, 10);
    await service.detectSpray(NOW);

    const later = new Date(NOW.getTime() + 31 * 60_000);
    state.attempts.length = 0;
    failures(seed, 30, 10, 1, later);

    expect(await service.detectSpray(later)).toEqual({ detected: true, opened: true });
    expect(state.anomalies).toHaveLength(2);
    expect(state.outbox).toHaveLength(2);
  });

  it('ignores failures older than the 10-minute window and attempts that were not failures', async () => {
    const { service, state, seed } = setup();
    failures(seed, 25, 10, 11);
    failures(seed, 20, 10, 1);
    for (let index = 0; index < 40; index += 1) seed('step_up_issued', `ok-${index}`, minutesAgo(1));

    expect(await service.detectSpray(NOW)).toEqual({ detected: false, opened: false });
    expect(state.anomalies).toHaveLength(0);
  });
});

describe('LoginSecurityService.record', () => {
  it('stores only keyed hashes and the result, stamped with the given time', async () => {
    const { service, state } = setup();
    await service.record('failed', { emailKey: 'hmac-email', ipKey: 'hmac-ip' }, NOW);

    expect(state.attempts).toEqual([
      expect.objectContaining({ emailKey: 'hmac-email', ipKey: 'hmac-ip', result: 'failed', createdAt: NOW }),
    ]);
  });
});

describe('LoginSecurityService.scheduleSprayDetection', () => {
  it('runs one spray scan at a time and folds a burst of failures into a single extra pass', async () => {
    const { service } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const detect = jest.spyOn(service, 'detectSpray').mockImplementation(async () => {
      await gate;
      return { detected: false, opened: false };
    });

    for (let failure = 0; failure < 20; failure += 1) service.scheduleSprayDetection();
    expect(detect).toHaveBeenCalledTimes(1);

    release();
    await service.onApplicationShutdown();
    expect(detect).toHaveBeenCalledTimes(2);

    service.scheduleSprayDetection();
    await service.onApplicationShutdown();
    expect(detect).toHaveBeenCalledTimes(3);
  });
});
