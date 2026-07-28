import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const API_BASE = 'http://localhost:8121/api/v1';
const WEB_BASE = 'http://localhost:3013';
const QA_CODE = 'qa_task124_required';
const QA_EMAIL = 'qa+task124-terms@test.local';
const QA_NICKNAME = '약관버전QA';
const QA_PASSWORD = 'Task124!password';
const OUTPUT_DIR = 'output/playwright/visual-audit/task124-version-flow';

function unwrap(body) {
  return body?.data ?? body;
}

async function api(path, { userEmail, method = 'GET', body } = {}) {
  const response = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return unwrap(payload);
}

function runPrisma(source) {
  const result = spawnSync(
    'docker',
    [
      'compose', 'exec', '-T', 'v1_api',
      'pnpm', '--filter', 'v1_api', 'exec', 'node', '-r', 'ts-node/register', '-e', source,
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) {
    throw new Error(`Prisma QA helper failed: ${result.stderr || result.stdout}`);
  }
}

function cleanupQaRows() {
  runPrisma(`
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const policy = await p.v1ManagedTermsPolicy.findUnique({
        where: { code: '${QA_CODE}' },
        include: { documents: { select: { id: true } } },
      });
      const user = await p.v1User.findUnique({ where: { email: '${QA_EMAIL}' } });
      const documentIds = policy?.documents.map((item) => item.id) ?? [];
      const targetIds = [...documentIds, ...(policy ? [policy.id] : [])];
      await p.$transaction(async (tx) => {
        if (targetIds.length) {
          await tx.v1StatusChangeLog.deleteMany({ where: { targetId: { in: targetIds } } });
          await tx.v1AdminActionLog.deleteMany({ where: { targetId: { in: targetIds } } });
        }
        if (user) {
          await tx.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: user.id } });
          await tx.v1AdminActionLog.deleteMany({ where: { adminUser: { userId: user.id } } });
          await tx.v1StatusChangeLog.deleteMany({ where: { adminUser: { userId: user.id } } });
          await tx.v1AdminUser.deleteMany({ where: { userId: user.id } });
        }
        if (policy) {
          await tx.v1ManagedTermsConsentEvent.deleteMany({ where: { documentId: { in: documentIds } } });
          await tx.v1ManagedTermsPlacement.deleteMany({ where: { policyId: policy.id } });
          await tx.v1ManagedTermsDocument.deleteMany({ where: { policyId: policy.id } });
          await tx.v1ManagedTermsPolicy.delete({ where: { id: policy.id } });
        }
        if (user) await tx.v1User.delete({ where: { id: user.id } });
      });
    })().finally(() => p[String.fromCharCode(36) + 'disconnect']());
  `);
}

function createQaAdmin() {
  runPrisma(`
    const { PrismaClient } = require('@prisma/client');
    const { hashPassword } = require('./src/auth/password-hash');
    const p = new PrismaClient();
    (async () => {
      const passwordHash = await hashPassword('${QA_PASSWORD}');
      const user = await p.v1User.create({
        data: {
          email: '${QA_EMAIL}',
          onboardingStatus: 'completed',
          profile: { create: { nickname: '${QA_NICKNAME}', displayName: '${QA_NICKNAME}' } },
          authIdentities: {
            create: {
              provider: 'email',
              providerUserKey: '${QA_EMAIL}',
              email: '${QA_EMAIL}',
              passwordHash,
              status: 'active',
            },
          },
        },
      });
      await p.v1AdminUser.create({
        data: { userId: user.id, adminRole: 'owner', status: 'active' },
      });
    })().finally(() => p[String.fromCharCode(36) + 'disconnect']());
  `);
}

async function login() {
  return api('/auth/login', {
    method: 'POST',
    body: { email: QA_EMAIL, password: QA_PASSWORD },
  });
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  cleanupQaRows();
  createQaAdmin();
  let browser;
  const evidence = {};
  try {
    const baselineTerms = await api('/terms/current?context=signup', { userEmail: QA_EMAIL });
    await api('/terms/consents', {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: {
        documentIds: baselineTerms.items
          .filter((item) => item.requirement === 'required')
          .map((item) => item.documentId),
      },
    });
    const initial = await api('/admin/terms', {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: {
        code: QA_CODE,
        name: 'Task 124 임시 필수 약관',
        placements: [{ context: 'signup', requirement: 'required', displayOrder: 999, isActive: true }],
        version: 'qa-1',
        title: 'Task 124 최초 필수 약관',
        subtitle: '현재 적용 중인 QA 기준',
        content: 'Task 124 최초 필수 약관 본문',
        changeSummary: 'QA 최초 발행',
        effectiveAt: '2026-07-01T00:00:00.000Z',
        requiresReconsent: true,
        enforcementAt: '2026-07-01T00:00:00.000Z',
      },
    });
    const initialDocument = initial.documents.find((item) => item.version === 'qa-1');
    await api(`/admin/terms/${initial.policyId}/documents/${initialDocument.documentId}/status`, {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: { status: 'published', reason: 'Task 124 최초 발행 QA' },
    });

    let signupTerms = await api('/terms/current?context=signup', { userEmail: QA_EMAIL });
    const pendingBeforeVersion = signupTerms.items
      .filter((item) => item.requirement === 'required' && !item.accepted)
      .map((item) => item.documentId);
    await api('/terms/consents', {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: { documentIds: pendingBeforeVersion },
    });

    const futureIso = new Date(Date.now() + 86_400_000).toISOString();
    let policy = await api(`/admin/terms/${initial.policyId}/documents`, {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: {
        version: 'qa-2-scheduled',
        title: 'Task 124 예약 필수 약관',
        subtitle: '내일부터 적용되는 QA 기준',
        content: 'Task 124 예약 필수 약관 본문',
        changeSummary: '예약 발행 검증',
        effectiveAt: futureIso,
        requiresReconsent: true,
        enforcementAt: futureIso,
      },
    });
    const scheduled = policy.documents.find((item) => item.version === 'qa-2-scheduled');
    await api(`/admin/terms/${initial.policyId}/documents/${scheduled.documentId}/status`, {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: { status: 'published', reason: 'Task 124 예약 발행 QA' },
    });
    signupTerms = await api('/terms/current?context=signup', { userEmail: QA_EMAIL });
    const activeAfterScheduled = signupTerms.items.find((item) => item.code === QA_CODE);
    if (activeAfterScheduled?.documentId !== initialDocument.documentId) {
      throw new Error('Future-effective version replaced the current document too early');
    }
    evidence.scheduledKeepsCurrent = true;

    policy = await api(`/admin/terms/${initial.policyId}/documents`, {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: {
        version: 'qa-3-immediate',
        title: 'Task 124 새 필수 약관',
        subtitle: '로그인 직후 확인해야 하는 QA 기준',
        content: 'Task 124 새 필수 약관 본문',
        changeSummary: '로그인 즉시 재동의 검증',
        effectiveAt: new Date(Date.now() - 60_000).toISOString(),
        requiresReconsent: true,
        enforcementAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    const immediate = policy.documents.find((item) => item.version === 'qa-3-immediate');
    await api(`/admin/terms/${initial.policyId}/documents/${immediate.documentId}/status`, {
      userEmail: QA_EMAIL,
      method: 'POST',
      body: { status: 'published', reason: 'Task 124 즉시 재동의 QA' },
    });

    const session = await login();
    if (!session.next?.route?.startsWith('/terms?mode=renewal')) {
      throw new Error(`Login did not return renewal route: ${JSON.stringify(session.next)}`);
    }
    evidence.loginNext = session.next.route;

    const protectedResponse = await fetch(API_BASE + '/notifications', {
      headers: { 'x-v1-user-email': QA_EMAIL },
    });
    const protectedBody = await protectedResponse.json();
    if (protectedResponse.status !== 403 || protectedBody?.code !== 'TERMS_RECONSENT_REQUIRED') {
      throw new Error(`Protected API was not blocked: ${protectedResponse.status} ${JSON.stringify(protectedBody)}`);
    }
    evidence.protectedApiBlocked = true;

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(WEB_BASE + '/login/email?redirect=%2Fmy', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.getByLabel('이메일').fill(QA_EMAIL);
    await page.locator('input[type="password"]').fill(QA_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    try {
      await page.waitForURL(/\/terms\?/, { timeout: 15_000 });
    } catch (error) {
      throw new Error(`Browser login did not reach renewal: ${JSON.stringify({
        url: page.url(),
        body: (await page.locator('body').innerText()).slice(0, 1200),
        consoleErrors,
        failedResponses,
      })}`, { cause: error });
    }
    try {
      await page.getByText('Task 124 새 필수 약관', { exact: false }).waitFor({ timeout: 15_000 });
    } catch (error) {
      throw new Error(`Renewal document did not render: ${JSON.stringify({
        url: page.url(),
        body: (await page.locator('body').innerText()).slice(0, 1600),
        consoleErrors,
        failedResponses,
      })}`, { cause: error });
    }
    await page.screenshot({ path: OUTPUT_DIR + '/mobile-renewal.png', fullPage: true });

    await page.goBack();
    await page.waitForTimeout(500);
    if (!page.url().includes('/terms?')) throw new Error(`Browser back bypassed renewal: ${page.url()}`);
    evidence.browserBackBlocked = true;

    await page.getByText('Task 124 새 필수 약관', { exact: false }).click();
    await page.getByRole('button', { name: '동의하고 계속하기' }).click();
    await page.waitForURL(/\/my(?:\?|$)/, { timeout: 15_000 });
    evidence.acceptedAndReturned = true;

    await page.goto(WEB_BASE + '/terms?document=privacy', { waitUntil: 'domcontentloaded' });
    await page.getByText('팀밋이 개인정보를 처리하고 보호하는 기준', { exact: true }).waitFor();
    evidence.footerUsesManagedDocument = true;

    const tournamentTerms = await api('/terms/current?context=tournament_application');
    const tournamentCodes = tournamentTerms.items.map((item) => item.code).sort();
    const expectedCodes = ['tournament_media', 'tournament_privacy', 'tournament_refund', 'tournament_rules'];
    if (JSON.stringify(tournamentCodes) !== JSON.stringify(expectedCodes)) {
      throw new Error(`Tournament managed terms mismatch: ${JSON.stringify(tournamentCodes)}`);
    }
    evidence.tournamentCurrentDocuments = tournamentCodes.length;

    if (consoleErrors.length || failedResponses.length) {
      throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, failedResponses })}`);
    }
    evidence.browserErrors = 0;
    process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
  } finally {
    if (browser) await browser.close();
    cleanupQaRows();
  }
}

await main();
