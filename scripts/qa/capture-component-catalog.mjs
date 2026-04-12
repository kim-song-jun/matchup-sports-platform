/**
 * capture-component-catalog.mjs
 *
 * Playwright script that navigates to live pages and captures element-level
 * screenshots of shared UI components. Each component is captured at two
 * viewports: mobile-md (390x844) and desktop-md (1440x900).
 *
 * Usage:
 *   node scripts/qa/capture-component-catalog.mjs
 *
 * Output:
 *   output/playwright/component-catalog/<component-name>/<viewport>.png
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { VIEWPORT_MATRIX } from './visual-audit-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output', 'playwright', 'component-catalog');
const WEB_BASE = process.env.E2E_WEB_BASE ?? 'http://localhost:3003';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8111';

// Only capture two representative viewports
const CAPTURE_VIEWPORTS = ['mobile-md', 'desktop-md'];

/**
 * Component catalog: each entry defines where to find the component and how to
 * locate it in the DOM.
 *
 * selectors: ordered list of CSS/text selectors tried in sequence; first visible
 * match wins. If none match, the component is skipped with a clear log message.
 */
const COMPONENT_CATALOG = [
  {
    name: 'EmptyState',
    route: '/my/matches',
    selectors: [
      '[data-testid="empty-state"]',
      '[data-testid="auth-wall"]',
    ],
    requiresAuth: true,
    note: 'Only visible when user has no matches; may be skipped if test data exists',
  },
  {
    name: 'MobileGlassHeader',
    // /profile renders MobileGlassHeader; /home uses a plain <header> element
    route: '/profile',
    selectors: [
      '[data-testid="mobile-glass-header"]',
    ],
    requiresAuth: true,
  },
  {
    name: 'BottomNav',
    route: '/home',
    selectors: [
      'nav[aria-label]',
      'nav',
    ],
    requiresAuth: true,
    note: 'Captures the floating pill bottom navigation bar',
  },
  {
    name: 'MatchCard',
    route: '/matches',
    selectors: [
      '[data-testid="match-card"]',
    ],
    requiresAuth: true,
  },
  {
    name: 'TeamCard',
    route: '/teams',
    selectors: [
      '[data-testid="team-card"]',
    ],
    requiresAuth: true,
  },
  {
    name: 'LessonCard',
    route: '/lessons',
    selectors: [
      '[data-testid="lesson-card"]',
    ],
    requiresAuth: true,
  },
  {
    name: 'MarketplaceCard',
    route: '/marketplace',
    selectors: [
      '[data-testid="marketplace-card"]',
    ],
    requiresAuth: true,
  },
  {
    name: 'ProfileSummary',
    route: '/profile',
    selectors: [
      '[data-testid="profile-summary"]',
    ],
    requiresAuth: true,
    note: 'Captures the profile header / summary area',
  },
  {
    name: 'Badge',
    route: '/badges',
    selectors: [
      '[data-testid="badge-card"]',
    ],
    requiresAuth: true,
  },
  {
    name: 'ButtonPrimary',
    route: '/login',
    selectors: [
      '[data-testid="auth-submit"]',
      'button[type="submit"]',
    ],
    requiresAuth: false,
  },
  {
    name: 'InputText',
    // /login renders email input immediately without any interaction
    route: '/login',
    selectors: [
      'input#login-email',
      'input[type="email"]',
    ],
    requiresAuth: false,
    note: 'Captures the email input on the login form; /matches/new requires sport selection first',
  },
  {
    name: 'FilterBar',
    route: '/matches',
    selectors: [
      '[data-testid="match-filter-bar"]',
    ],
    requiresAuth: true,
  },
];

// ---------------------------------------------------------------------------
// Auth helpers (replicated from run-visual-audit.mjs — private there)
// ---------------------------------------------------------------------------

async function loginViaApi(nickname) {
  const response = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`dev-login failed for "${nickname}": ${response.status} ${text}`);
  }

  const body = await response.json();
  return body.data ?? body;
}

async function injectTokens(page, tokens) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.evaluate((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken);
        if (payload.user) {
          localStorage.setItem('authUser', JSON.stringify(payload.user));
        }
        // Set a minimal cookie so server-side auth checks pass
        document.cookie = 'accessToken=1; path=/; max-age=604800; SameSite=Lax';
      }, tokens);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// Element capture
// ---------------------------------------------------------------------------

/**
 * Tries each selector in order and returns the first element that is visible
 * and has a nonzero bounding box. Returns null if none match.
 */
async function findFirstVisibleElement(page, selectors) {
  for (const selector of selectors) {
    try {
      let locator;

      // text= selectors need special handling
      if (selector.startsWith('text=')) {
        const text = selector.slice(5);
        locator = page.getByText(text, { exact: false }).first();
      } else {
        locator = page.locator(selector).first();
      }

      const element = await locator.elementHandle({ timeout: 3_000 });
      if (!element) {
        continue;
      }

      const box = await element.boundingBox();
      if (!box || box.width === 0 || box.height === 0) {
        continue;
      }

      return element;
    } catch {
      // selector timed out or threw — try next
    }
  }

  return null;
}

/**
 * Captures a single component at a single viewport. Returns a result object.
 */
async function captureComponent(context, component, viewportKey) {
  const viewport = VIEWPORT_MATRIX[viewportKey];
  const page = await context.newPage();
  const result = {
    component: component.name,
    viewport: viewportKey,
    status: 'skipped',
    reason: null,
    outputPath: null,
  };

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Navigate to a neutral page first so localStorage injection has a context
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(500);

    // For auth-required routes, inject tokens from the shared session
    if (component.requiresAuth && context._authTokens) {
      await injectTokens(page, context._authTokens);
    }

    // Navigate to the target route
    await page.goto(`${WEB_BASE}${component.route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // Allow network activity to settle
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);

    const element = await findFirstVisibleElement(page, component.selectors);

    if (!element) {
      result.status = 'not-found';
      result.reason = component.note
        ? `Element not found. Note: ${component.note}`
        : `No selector matched: ${component.selectors.join(', ')}`;
      console.warn(`  [SKIP] ${component.name} @ ${viewportKey}: ${result.reason}`);
      return result;
    }

    const outputDir = path.join(OUTPUT_ROOT, component.name);
    ensureDir(outputDir);
    const outputPath = path.join(outputDir, `${viewportKey}.png`);

    await element.screenshot({ path: outputPath });

    result.status = 'captured';
    result.outputPath = path.relative(REPO_ROOT, outputPath);
    console.log(`  [OK]   ${component.name} @ ${viewportKey} → ${result.outputPath}`);
  } catch (error) {
    result.status = 'error';
    result.reason = error instanceof Error ? error.message : String(error);
    console.error(`  [ERR]  ${component.name} @ ${viewportKey}: ${result.reason}`);
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Component Catalog Capture');
  console.log(`  Web: ${WEB_BASE}`);
  console.log(`  API: ${API_BASE}`);
  console.log(`  Output: ${path.relative(REPO_ROOT, OUTPUT_ROOT)}`);
  console.log(`  Viewports: ${CAPTURE_VIEWPORTS.join(', ')}`);
  console.log('');

  ensureDir(OUTPUT_ROOT);

  const browser = await chromium.launch({ headless: true });

  try {
    // Authenticate once and reuse tokens across all page captures
    console.log('Authenticating as 시나로E2E …');
    let authTokens = null;
    try {
      authTokens = await loginViaApi('시나로E2E');
      console.log('  Auth OK');
    } catch (error) {
      console.warn(`  Auth FAILED: ${error.message}`);
      console.warn('  Components requiring auth will attempt unauthenticated access (likely redirect)');
    }

    const allResults = [];

    for (const viewportKey of CAPTURE_VIEWPORTS) {
      const viewport = VIEWPORT_MATRIX[viewportKey];
      console.log(`\nViewport: ${viewportKey} (${viewport.width}x${viewport.height})`);

      // One browser context per viewport preserves correct device emulation
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
      });

      // Attach tokens so captureComponent can access them
      context._authTokens = authTokens;

      for (const component of COMPONENT_CATALOG) {
        const result = await captureComponent(context, component, viewportKey);
        allResults.push(result);
      }

      await context.close();
    }

    // Write summary JSON
    const summaryPath = path.join(OUTPUT_ROOT, 'catalog-results.json');
    const summary = {
      capturedAt: new Date().toISOString(),
      viewports: CAPTURE_VIEWPORTS,
      components: COMPONENT_CATALOG.length,
      results: allResults,
      stats: {
        captured: allResults.filter((r) => r.status === 'captured').length,
        notFound: allResults.filter((r) => r.status === 'not-found').length,
        error: allResults.filter((r) => r.status === 'error').length,
      },
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log('\n--- Summary ---');
    console.log(`  Captured:  ${summary.stats.captured}`);
    console.log(`  Not found: ${summary.stats.notFound}`);
    console.log(`  Errors:    ${summary.stats.error}`);
    console.log(`  Results:   ${path.relative(REPO_ROOT, summaryPath)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
