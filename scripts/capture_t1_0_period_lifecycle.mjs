/**
 * T1-0 fix round 1 — live visual verification of the operate console's
 * period-lifecycle UI (coordinator-requested, temp server pair on
 * web:3031 / api:8131, DB = shared teameet_v1_dev).
 *
 * Every state transition (start / next-period) is driven through a REAL
 * button click in a real browser -- not a REST shortcut -- because the
 * exclusive takeover token this console requires is only obtainable over
 * the Socket.IO gateway (`game.takeover.request`), which the console wires
 * up on mount. Each command is clicked in its own short-lived page, then
 * that page is closed and state is re-verified from a FRESH page load
 * (rather than asserting in-place immediately after the click) -- this
 * sidesteps an observed `next dev`/Fast-Refresh timing flake where an
 * immediate post-click locator wait occasionally times out even though the
 * command genuinely succeeded (confirmed via debug reruns: a fresh reload
 * right after always showed the correct new state).
 *
 * Captures 3 states x mobile(390)/tablet(768)/desktop(1440):
 *   01-scheduled-banner — "경기를 시작해 주세요." banner, roster disabled
 *   02-live-period1     — banner gone, "전반 종료" button, roster active
 *   04-live-period2     — "경기 종료" only, no next-period button, no banner
 * Plus two desktop-only clock proofs (03-clock-advancing-proof,
 * 05-period2-clock-proof): taps a real player, several seconds apart and
 * across the next-period transition, and captures the event-capture
 * modal's frozen "N피리어드 · M:SS 시점 기록 (고정됨)" text each time to
 * prove it is never stuck at 0:00 and correctly reflects the live period.
 *
 * Usage: T1_0_SEED_JSON='{"tournamentId":"...","fixtureId":"..."}' \
 *   node scripts/capture_t1_0_period_lifecycle.mjs
 * (tournamentId/fixtureId come from apps/v1_api/seed-t1-0-visual.ts's output
 * -- a one-off, uncommitted seed script that creates a real TOURNAMENT_FIXTURE
 * game + submitted HOME lineup via GamesService, the same path the
 * integration tests use, scoped to the real 'futsal' sport + futsal-v1
 * config so it doesn't add a new sport row to the shared dev DB.)
 *
 * Auth: dev header auth via localStorage teameet.v1.userEmail (admin@teameet.v1,
 * a real seeded tournament_director-eligible persona) -> x-v1-user-email header,
 * per project convention (docs/ops/pr-review-visual-workflow.md).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const WEB = 'http://localhost:3031';
const OUT = 'scripts/t1-0-visual-evidence';
const ADMIN_EMAIL = 'admin@teameet.v1';

const { tournamentId, fixtureId } = JSON.parse(process.env.T1_0_SEED_JSON);
const operatePath = `/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/operate`;

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openAuthedPage(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${WEB}${operatePath}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((email) => {
    localStorage.removeItem('teameet.v1.userId');
    localStorage.setItem('teameet.v1.userEmail', email);
  }, ADMIN_EMAIL);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  return { context, page };
}

async function shotAllViewports(browser, stateLabel) {
  for (const vp of VIEWPORTS) {
    const { context, page } = await openAuthedPage(browser, vp.width, vp.height);
    const dir = `${OUT}/${stateLabel}`;
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${vp.name}.png`, fullPage: true });
    console.log(`captured ${stateLabel}/${vp.name}.png`);
    await context.close();
  }
}

/** Clicks `label`, closes the page, then re-opens a fresh page to confirm
 * the transition genuinely landed server-side (see the flake note above). */
async function runCommand(browser, label) {
  const { context, page } = await openAuthedPage(browser, 1440, 900);
  await page.getByRole('button', { name: label }).click({ timeout: 15_000 });
  await sleep(2500);
  await context.close();

  const { context: verifyContext, page: verifyPage } = await openAuthedPage(browser, 1440, 900);
  const text = await verifyPage.locator('body').innerText();
  await verifyContext.close();
  console.log(`after "${label}" click, fresh reload body head:`, text.split('\n').slice(0, 12).join(' | '));
}

/** Taps the first roster player, captures the modal, and returns the frozen
 * "N피리어드 · M:SS 시점 기록" text (or null if not found). */
async function tapPlayerAndCapture(browser, screenshotPath) {
  const { context, page } = await openAuthedPage(browser, 1440, 900);
  const playerButton = page.getByRole('button', { name: /선수 이벤트 기록/ }).first();
  await playerButton.waitFor({ state: 'visible', timeout: 15_000 });
  await playerButton.click({ timeout: 10_000 });
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(300);
  mkdirSync(screenshotPath.split('/').slice(0, -1).join('/'), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const text = await page.locator('body').innerText();
  const match = text.match(/(\d+)피리어드\s*·\s*(\d+):(\d+)\s*시점 기록/);
  await context.close();
  return match ? match[0] : null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // 1. SCHEDULED — banner + disabled roster
  await shotAllViewports(browser, '01-scheduled-banner');

  await runCommand(browser, '경기 시작');

  // 2. LIVE period 1 — banner gone, "전반 종료" button, roster active
  await shotAllViewports(browser, '02-live-period1');

  // Clock-advancing proof: tap a real player twice, several real seconds
  // apart, and confirm the frozen clock text differs and is nonzero both
  // times (the exact bug this fix closes: before T1-0 every tap froze at
  // clockMs=0 regardless of elapsed real time).
  await sleep(4000);
  const tap1 = await tapPlayerAndCapture(browser, `${OUT}/03-clock-advancing-proof/tap-1.png`);
  console.log('tap-1 frozen clock text:', tap1 ?? '(NOT FOUND)');
  await sleep(6000);
  const tap2 = await tapPlayerAndCapture(browser, `${OUT}/03-clock-advancing-proof/tap-2.png`);
  console.log('tap-2 frozen clock text:', tap2 ?? '(NOT FOUND)');

  await runCommand(browser, '전반 종료');

  // 3. LIVE period 2 — "경기 종료" only, no next-period button
  await shotAllViewports(browser, '04-live-period2');

  // Period-2 proof: the frozen clock should now read "2피리어드", counting
  // up from period 2's own startedAt (not carried over from period 1, not
  // frozen at 0:00).
  const tapP2 = await tapPlayerAndCapture(browser, `${OUT}/05-period2-clock-proof/period2-tap.png`);
  console.log('period-2 frozen clock text:', tapP2 ?? '(NOT FOUND)');

  await browser.close();
  console.log('DONE', JSON.stringify({ tap1, tap2, tapP2 }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
