import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const API_BASE = process.env.API_BASE ?? 'http://localhost:8121';
const WEB_BASE = process.env.WEB_BASE ?? 'http://localhost:3013';
const REVIEW_EMAILS = (process.env.REVIEW_EMAILS ?? process.env.REVIEW_OWNER_EMAIL ?? 'owner@teameet.v1,admin@teameet.v1')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);
const EVIDENCE_JSON = process.env.EVIDENCE_JSON
  ?? 'evidence/task103-admin-review-seed-20260607/admin-reviews-live-check.json';
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH
  ?? 'output/playwright/visual-audit/task103-admin-review-seed-20260607/admin-reviews-live-check.png';
const VIEWPORT = parseViewport(process.env.VIEWPORT ?? '1440x960');

const browser = await chromium.launch();
try {
  const personas = [];

  for (const email of REVIEW_EMAILS) {
    personas.push(await checkPersona(email));
  }

  await writeEvidence({
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    webBase: WEB_BASE,
    viewport: VIEWPORT,
    personas,
  });
} finally {
  await browser.close();
}

async function checkPersona(email) {
  const session = await devLogin(email);
  const expectedReviews = await pendingReviews(session);
  assert.ok(expectedReviews.length > 0, `expected seeded pending reviews for ${email}`);

  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' });
  });

  await page.addInitScript((value) => {
    localStorage.setItem('teameet.v1.userId', value.userId);
    localStorage.setItem('teameet.v1.userEmail', value.userEmail);
  }, session);

  await page.goto(`${WEB_BASE}/admin/reviews`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-reviews-open-design').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText(`${expectedReviews.length}개 리뷰 대기`).waitFor({ state: 'visible', timeout: 15_000 });

  const pageText = await page.getByTestId('admin-reviews-open-design').innerText();
  const emptyStateVisible = await page.getByText('작성할 리뷰가 없습니다.').isVisible().catch(() => false);
  const reviewLinks = await page.locator('[data-testid="admin-reviews-open-design"] a[href^="/my/reviews/"]').evaluateAll((links) =>
    links
      .map((link) => ({ text: (link.textContent ?? '').trim(), href: link.getAttribute('href') ?? '' }))
      .filter((link) => /^\/my\/reviews\/(match|team_match)\//.test(link.href)),
  );

  assert.equal(emptyStateVisible, false, `${email} admin review page must not show the empty review state after seed`);
  for (const review of expectedReviews) {
    assert.ok(pageText.includes(review.title), `${email} ${review.title} pending review row is missing`);
  }
  assert.ok(reviewLinks.length >= expectedReviews.length, `${email} expected at least ${expectedReviews.length} review source links, got ${reviewLinks.length}`);

  const screenshot = screenshotPath(email);
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });

  const firstExpectedHref = `/my/reviews/${expectedReviews[0].sourceType}/${expectedReviews[0].sourceId}`;
  await page.locator(`[data-testid="admin-reviews-open-design"] a[href="${firstExpectedHref}"]`).first().click();
  await page.waitForURL(/\/my\/reviews\/(match|team_match)\//, { timeout: 15_000 });
  const destinationUrl = page.url();
  assert.ok(destinationUrl.endsWith(firstExpectedHref), `expected navigation to ${firstExpectedHref}, got ${destinationUrl}`);
  await page.getByTestId('review-compose-open-design').waitFor({ state: 'visible', timeout: 15_000 });

  assert.deepEqual(consoleErrors, [], `${email} browser console errors must be empty`);
  assert.deepEqual(failedRequests, [], `${email} browser request failures must be empty`);
  await context.close();

  return {
    email,
    session: { userEmail: session.userEmail, hasUserId: Boolean(session.userId) },
    expectedReviews,
    emptyStateVisible,
    reviewLinks,
    destinationUrl,
    screenshot,
    consoleErrors,
    failedRequests,
  };
}

async function devLogin(email) {
  const response = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`dev-login failed: ${response.status} ${text}`);
  const body = JSON.parse(text);
  const data = body.data ?? body;
  const session = data.session;
  assert.ok(session?.userId, 'dev-login must return session.userId');
  assert.equal(session.userEmail, email);
  return session;
}

function parseViewport(value) {
  const [widthText, heightText] = value.split('x');
  const width = Number(widthText);
  const height = Number(heightText);
  assert.ok(Number.isInteger(width) && width > 0, `invalid viewport width: ${value}`);
  assert.ok(Number.isInteger(height) && height > 0, `invalid viewport height: ${value}`);
  return { width, height };
}

async function pendingReviews(session) {
  const response = await fetch(`${API_BASE}/api/v1/reviews?tab=pending&limit=12`, {
    headers: {
      'x-v1-user-id': session.userId,
      'x-v1-user-email': session.userEmail,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`reviews failed: ${response.status} ${text}`);
  const body = JSON.parse(text);
  const items = body.data?.items;
  assert.ok(Array.isArray(items), 'reviews response must contain data.items');
  return items
    .filter((item) => item.state === 'ready' && Number(item.remainingCount) > 0)
    .map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      remainingCount: item.remainingCount,
    }));
}

async function writeEvidence(value) {
  await mkdir(path.dirname(EVIDENCE_JSON), { recursive: true });
  await writeFile(EVIDENCE_JSON, `${JSON.stringify(value, null, 2)}\n`);
}

function screenshotPath(email) {
  if (REVIEW_EMAILS.length === 1) return SCREENSHOT_PATH;
  const parsed = path.parse(SCREENSHOT_PATH);
  return path.join(parsed.dir, `${parsed.name}-${email.replace(/[^a-z0-9]+/gi, '-')}${parsed.ext}`);
}
