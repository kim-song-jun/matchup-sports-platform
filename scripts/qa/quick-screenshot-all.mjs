/**
 * Quick full-page screenshot capture for plan verification.
 * Takes one screenshot per route at mobile-md (390x844).
 * Usage: node scripts/qa/quick-screenshot-all.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'playwright', 'quick-screenshots');
const WEB_BASE = 'http://localhost:3003';
const API_BASE = 'http://localhost:8111';

const VIEWPORT = { width: 390, height: 844 };

// Routes grouped by auth requirement
const PUBLIC_ROUTES = [
  '/landing',
  '/about',
  '/guide',
  '/pricing',
  '/faq',
  '/login',
];

const USER_ROUTES = [
  '/home',
  '/matches',
  '/matches/new',
  '/team-matches',
  '/team-matches/new',
  '/teams',
  '/teams/new',
  '/lessons',
  '/lessons/new',
  '/marketplace',
  '/marketplace/new',
  '/mercenary',
  '/mercenary/new',
  '/venues',
  '/tournaments',
  '/tournaments/new',
  '/profile',
  '/settings',
  '/settings/account',
  '/settings/notifications',
  '/settings/privacy',
  '/settings/terms',
  '/notifications',
  '/chat',
  '/reviews',
  '/badges',
  '/feed',
  '/onboarding',
  '/payments',
  '/my/matches',
  '/my/teams',
  '/my/team-matches',
  '/my/team-match-applications',
  '/my/lessons',
  '/my/lesson-tickets',
  '/my/listings',
  '/my/mercenary',
  '/my/reviews-received',
];

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/matches',
  '/admin/team-matches',
  '/admin/teams',
  '/admin/lessons',
  '/admin/lesson-tickets',
  '/admin/venues',
  '/admin/venues/new',
  '/admin/marketplace',
  '/admin/mercenary',
  '/admin/payments',
  '/admin/settlements',
  '/admin/disputes',
  '/admin/reviews',
  '/admin/statistics',
];

// Dynamic routes need real IDs - we'll discover them from list pages
const DYNAMIC_ROUTE_DISCOVERY = {
  '/matches/[id]': { listApi: '/api/v1/matches?limit=1', idPath: 'data.items.0.id', urlTemplate: '/matches/{id}' },
  '/team-matches/[id]': { listApi: '/api/v1/team-matches?limit=1', idPath: 'data.items.0.id', urlTemplate: '/team-matches/{id}' },
  '/teams/[id]': { listApi: '/api/v1/teams?limit=1', idPath: 'data.items.0.id', urlTemplate: '/teams/{id}' },
  '/lessons/[id]': { listApi: '/api/v1/lessons?limit=1', idPath: 'data.items.0.id', urlTemplate: '/lessons/{id}' },
  '/marketplace/[id]': { listApi: '/api/v1/marketplace/listings?limit=1', idPath: 'data.items.0.id', urlTemplate: '/marketplace/{id}' },
  '/mercenary/[id]': { listApi: '/api/v1/mercenary?limit=1', idPath: 'data.items.0.id', urlTemplate: '/mercenary/{id}' },
  '/venues/[id]': { listApi: '/api/v1/venues?limit=1', idPath: 'data.items.0.id', urlTemplate: '/venues/{id}' },
};

async function devLogin(nickname) {
  const res = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const body = await res.json();
  const data = body.data ?? body;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  };
}

async function injectAuth(page, tokens) {
  await page.evaluate((t) => {
    localStorage.setItem('accessToken', t.accessToken);
    localStorage.setItem('refreshToken', t.refreshToken);
    if (t.user) localStorage.setItem('authUser', JSON.stringify(t.user));
  }, tokens);
}

function slugify(route) {
  if (route === '/') return 'root';
  return route.replace(/^\//, '').replace(/\//g, '__').replace(/[^a-zA-Z0-9_-]/g, '-');
}

async function captureRoute(page, route, outputDir, index, total) {
  const slug = slugify(route);
  const filePath = path.join(outputDir, `${String(index).padStart(3, '0')}_${slug}.png`);

  try {
    await page.goto(`${WEB_BASE}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for content to settle
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1_000);

    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`  [${index}/${total}] OK  ${route}`);
    return { route, status: 'ok', file: filePath };
  } catch (err) {
    console.log(`  [${index}/${total}] FAIL ${route} — ${err.message.slice(0, 80)}`);
    // Take screenshot anyway if page partially loaded
    try {
      await page.screenshot({ path: filePath, fullPage: true });
    } catch {}
    return { route, status: 'error', error: err.message, file: filePath };
  }
}

async function discoverDynamicIds(tokens) {
  const discovered = {};
  for (const [template, spec] of Object.entries(DYNAMIC_ROUTE_DISCOVERY)) {
    try {
      const res = await fetch(`${API_BASE}${spec.listApi}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const body = await res.json();
      // Navigate the idPath
      const parts = spec.idPath.split('.');
      let value = body;
      for (const part of parts) {
        value = value?.[part];
      }
      if (value) {
        discovered[template] = spec.urlTemplate.replace('{id}', value);
        console.log(`  Discovered: ${template} → ${discovered[template]}`);
      }
    } catch (err) {
      console.log(`  Skip dynamic: ${template} — ${err.message.slice(0, 60)}`);
    }
  }
  return discovered;
}

async function main() {
  // Clean output
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const publicDir = path.join(OUTPUT_DIR, '1_public');
  const userDir = path.join(OUTPUT_DIR, '2_user');
  const dynamicDir = path.join(OUTPUT_DIR, '3_dynamic');
  const adminDir = path.join(OUTPUT_DIR, '4_admin');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(dynamicDir, { recursive: true });
  fs.mkdirSync(adminDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let idx = 0;
  const totalEst = PUBLIC_ROUTES.length + USER_ROUTES.length + ADMIN_ROUTES.length + Object.keys(DYNAMIC_ROUTE_DISCOVERY).length;

  // === 1. Public routes (no auth) ===
  console.log('\n=== Phase 1: Public Routes ===');
  const guestCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const guestPage = await guestCtx.newPage();

  for (const route of PUBLIC_ROUTES) {
    idx++;
    results.push(await captureRoute(guestPage, route, publicDir, idx, totalEst));
  }
  await guestCtx.close();

  // === 2. User routes (auth as test user) ===
  console.log('\n=== Phase 2: User Routes ===');
  let userTokens;
  try {
    userTokens = await devLogin('시나로E2E');
    console.log('  Logged in as 시나로E2E');
  } catch (err) {
    console.error('  dev-login failed:', err.message);
    await browser.close();
    process.exit(1);
  }

  const userCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const userPage = await userCtx.newPage();
  // Inject auth
  await userPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await injectAuth(userPage, userTokens);
  await userPage.goto(`${WEB_BASE}/home`, { waitUntil: 'domcontentloaded' });
  await userPage.waitForTimeout(2_000);

  for (const route of USER_ROUTES) {
    idx++;
    results.push(await captureRoute(userPage, route, userDir, idx, totalEst));
  }

  // === 3. Dynamic routes ===
  console.log('\n=== Phase 3: Dynamic Routes ===');
  const dynamicUrls = await discoverDynamicIds(userTokens);
  for (const [template, url] of Object.entries(dynamicUrls)) {
    idx++;
    results.push(await captureRoute(userPage, url, dynamicDir, idx, totalEst));
  }
  await userCtx.close();

  // === 4. Admin routes ===
  console.log('\n=== Phase 4: Admin Routes ===');
  let adminTokens;
  try {
    adminTokens = await devLogin('관리자E2E');
    console.log('  Logged in as 관리자E2E');
  } catch (err) {
    console.error('  admin dev-login failed:', err.message);
    adminTokens = null;
  }

  if (adminTokens) {
    const adminCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await injectAuth(adminPage, adminTokens);
    await adminPage.goto(`${WEB_BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(2_000);

    for (const route of ADMIN_ROUTES) {
      idx++;
      results.push(await captureRoute(adminPage, route, adminDir, idx, totalEst));
    }
    await adminCtx.close();
  }

  await browser.close();

  // === Summary ===
  const ok = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'error').length;

  const summary = [
    `# Quick Screenshot Audit — ${new Date().toISOString()}`,
    ``,
    `Viewport: ${VIEWPORT.width}x${VIEWPORT.height} (mobile-md, 2x)`,
    `Total: ${results.length} | OK: ${ok} | Failed: ${fail}`,
    ``,
    `## Results`,
    ``,
    ...results.map(r => `- [${r.status === 'ok' ? 'OK' : 'FAIL'}] ${r.route}${r.error ? ` — ${r.error.slice(0, 100)}` : ''}`),
  ].join('\n');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.md'), summary);
  console.log(`\n=== Done: ${ok} OK / ${fail} FAIL out of ${results.length} ===`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
