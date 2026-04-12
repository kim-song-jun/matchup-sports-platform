/**
 * capture-asset-inventory.mjs
 *
 * Two-phase script:
 *   Phase 1 (filesystem): scans apps/web/public/ and src/components/icons/ to
 *   build a structured JSON inventory of all visual assets.
 *
 *   Phase 2 (Playwright): captures representative page-level renders of sport
 *   icons, badge icons, match thumbnails, and profile avatars.
 *
 * Usage:
 *   node scripts/qa/capture-asset-inventory.mjs
 *
 * Output:
 *   output/playwright/asset-inventory/inventory.json
 *   output/playwright/asset-inventory/renders/sport-icons.png
 *   output/playwright/asset-inventory/renders/badge-icons.png
 *   output/playwright/asset-inventory/renders/match-thumbnails.png
 *   output/playwright/asset-inventory/renders/profile-avatars.png
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { VIEWPORT_MATRIX } from './visual-audit-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_ROOT = path.join(REPO_ROOT, 'apps', 'web', 'public');
const ICONS_SRC = path.join(REPO_ROOT, 'apps', 'web', 'src', 'components', 'icons', 'sport-icons.tsx');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output', 'playwright', 'asset-inventory');
const RENDERS_DIR = path.join(OUTPUT_ROOT, 'renders');

const WEB_BASE = process.env.E2E_WEB_BASE ?? 'http://localhost:3003';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8111';

// Use mobile-md viewport for render captures (primary device target)
const RENDER_VIEWPORT_KEY = 'mobile-md';

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

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico', '.avif']);

/**
 * Recursively lists all files under a directory, returning objects with
 * relative path (from PUBLIC_ROOT), extension, and file size in bytes.
 */
function scanDirectory(dirPath, baseDir = dirPath) {
  const entries = [];

  if (!fs.existsSync(dirPath)) {
    return entries;
  }

  for (const name of fs.readdirSync(dirPath).sort()) {
    if (name.startsWith('.')) {
      continue; // skip dotfiles like .gitkeep
    }

    const fullPath = path.join(dirPath, name);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      entries.push(...scanDirectory(fullPath, baseDir));
    } else if (IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      entries.push({
        path: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
        ext: path.extname(name).toLowerCase().slice(1),
        sizeBytes: stat.size,
      });
    }
  }

  return entries;
}

/**
 * Reads the sport-icons.tsx source file and extracts exported icon function
 * names and the SportIconMap keys. Returns a structured list.
 */
function extractSportIconMeta() {
  const icons = [];

  if (!fs.existsSync(ICONS_SRC)) {
    return icons;
  }

  const source = fs.readFileSync(ICONS_SRC, 'utf8');

  // Extract exported function component names (e.g. "export function FutsalIcon")
  const funcPattern = /export function (\w+Icon)\s*\(/g;
  let match;
  while ((match = funcPattern.exec(source)) !== null) {
    icons.push({
      name: match[1],
      source: 'components/icons/sport-icons.tsx',
      type: 'svg-component',
    });
  }

  // Extract SportIconMap keys (e.g. futsal: FutsalIcon)
  const mapBlock = source.match(/SportIconMap[^{]*\{([^}]+)\}/s)?.[1] ?? '';
  const keyPattern = /(\w+)\s*:/g;
  const mapKeys = [];
  while ((match = keyPattern.exec(mapBlock)) !== null) {
    mapKeys.push(match[1]);
  }

  return { components: icons, mapKeys };
}

// ---------------------------------------------------------------------------
// Phase 1: Filesystem inventory
// ---------------------------------------------------------------------------

function buildInventory() {
  const allPublicFiles = scanDirectory(PUBLIC_ROOT);

  // Brand assets: top-level non-mock files
  const brand = allPublicFiles.filter((f) => !f.path.startsWith('mock/')).map((f) => ({
    path: f.path,
    type: f.ext,
    sizeBytes: f.sizeBytes,
  }));

  // Icons from source components
  const { components: iconComponents, mapKeys: sportIconMapKeys } = extractSportIconMeta();
  const icons = iconComponents.map((ic) => ({
    name: ic.name,
    source: ic.source,
    type: ic.type,
    usedIn: 'SportIconMap',
  }));

  // Mock images breakdown by subdirectory category
  const mockFiles = allPublicFiles.filter((f) => f.path.startsWith('mock/'));

  const generated = mockFiles
    .filter((f) => f.path.startsWith('mock/generated/'))
    .map((f) => ({ path: f.path, type: f.ext, sizeBytes: f.sizeBytes }));

  const genericImages = mockFiles
    .filter((f) => f.path.startsWith('mock/generic/'))
    .map((f) => ({ path: f.path, type: f.ext, sizeBytes: f.sizeBytes }));

  const marketplace = mockFiles
    .filter((f) => f.path.startsWith('mock/marketplace/'))
    .map((f) => ({ path: f.path, type: f.ext, sizeBytes: f.sizeBytes }));

  const sportImages = mockFiles
    .filter((f) => f.path.startsWith('mock/sports/'))
    .map((f) => ({ path: f.path, type: f.ext, sizeBytes: f.sizeBytes }));

  const profileAvatars = mockFiles
    .filter((f) => f.path.startsWith('mock/profile/'))
    .map((f) => ({ path: f.path, type: f.ext, sizeBytes: f.sizeBytes }));

  // Photoreal images grouped by sport/category subdirectory
  const photorealFiles = mockFiles.filter((f) => f.path.startsWith('mock/photoreal/'));
  const photorealByCategory = {};
  for (const f of photorealFiles) {
    // path: mock/photoreal/<category>/<file>
    const segments = f.path.split('/');
    const category = segments[2] ?? 'uncategorized';
    if (!photorealByCategory[category]) {
      photorealByCategory[category] = [];
    }
    photorealByCategory[category].push({ path: f.path, type: f.ext, sizeBytes: f.sizeBytes });
  }

  const photoreal = Object.entries(photorealByCategory).map(([category, files]) => ({
    category,
    count: files.length,
    files,
  }));

  return {
    generatedAt: new Date().toISOString(),
    brand,
    icons: {
      sportIconComponents: icons,
      sportIconMapKeys,
      sourceFile: 'apps/web/src/components/icons/sport-icons.tsx',
    },
    mockImages: {
      generated,
      generic: genericImages,
      marketplace,
      sports: sportImages,
      profileAvatars,
      photoreal,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Playwright renders
// ---------------------------------------------------------------------------

/**
 * Defines each render target: which page to visit, what selector to capture,
 * and which output filename to use.
 */
const RENDER_TARGETS = [
  {
    name: 'sport-icons',
    route: '/home',
    // Look for the sport icon grid area on the home page
    selectors: [
      '[data-testid*="sport-grid"]',
      '[data-testid*="sport-icons"]',
      '[data-testid*="sport-section"]',
      // Generic fallback: a grid containing sport-related items
      '.grid',
      'main section:first-of-type',
    ],
    requiresAuth: true,
    note: 'Sport icon grid on home page',
  },
  {
    name: 'badge-icons',
    route: '/badges',
    selectors: [
      '[data-testid*="badge-grid"]',
      '[data-testid*="badges"]',
      'main section',
      'main',
    ],
    requiresAuth: true,
    note: 'Badge icon area on badges page',
  },
  {
    name: 'match-thumbnails',
    route: '/matches',
    selectors: [
      '[data-testid="match-results"]',
      '[data-testid*="match-list"]',
      'main section',
      'main',
    ],
    requiresAuth: true,
    note: 'Match card thumbnails on matches listing page',
  },
  {
    name: 'profile-avatars',
    route: '/profile',
    selectors: [
      '[data-testid*="avatar"]',
      '[data-testid*="profile-image"]',
      'img[alt*="프로필"]',
      'main section:first-of-type',
    ],
    requiresAuth: true,
    note: 'Profile avatar area on profile page',
  },
];

/**
 * Captures a render target using the first matching visible element.
 * Falls back to a full-page screenshot of main if no element matches.
 */
async function captureRender(page, target, authTokens) {
  const result = {
    name: target.name,
    status: 'skipped',
    reason: null,
    outputPath: null,
  };

  try {
    // Start from login page to get a valid page context for token injection
    await page.goto(`${WEB_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(300);

    if (target.requiresAuth && authTokens) {
      await injectTokens(page, authTokens);
    }

    await page.goto(`${WEB_BASE}${target.route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);

    ensureDir(RENDERS_DIR);
    const outputPath = path.join(RENDERS_DIR, `${target.name}.png`);

    // Try each selector; use first visible element with nonzero dimensions
    let captured = false;
    for (const selector of target.selectors) {
      try {
        const locator = page.locator(selector).first();
        const element = await locator.elementHandle({ timeout: 3_000 });
        if (!element) {
          continue;
        }

        const box = await element.boundingBox();
        if (!box || box.width === 0 || box.height === 0) {
          continue;
        }

        await element.screenshot({ path: outputPath });
        captured = true;
        break;
      } catch {
        // try next selector
      }
    }

    if (!captured) {
      // Fallback: screenshot the <main> element or full page
      try {
        const main = await page.locator('main').first().elementHandle({ timeout: 2_000 });
        if (main) {
          await main.screenshot({ path: outputPath });
          captured = true;
          result.reason = 'Element selectors missed; fell back to <main>';
        }
      } catch {
        // main not found either
      }
    }

    if (!captured) {
      result.status = 'not-found';
      result.reason = target.note
        ? `No element matched. Note: ${target.note}`
        : `No selector matched: ${target.selectors.join(', ')}`;
      console.warn(`  [SKIP] ${target.name}: ${result.reason}`);
      return result;
    }

    result.status = 'captured';
    result.outputPath = path.relative(REPO_ROOT, outputPath);
    if (result.reason) {
      console.log(`  [OK]   ${target.name} → ${result.outputPath} (${result.reason})`);
    } else {
      console.log(`  [OK]   ${target.name} → ${result.outputPath}`);
    }
  } catch (error) {
    result.status = 'error';
    result.reason = error instanceof Error ? error.message : String(error);
    console.error(`  [ERR]  ${target.name}: ${result.reason}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Asset Inventory Capture');
  console.log(`  Web: ${WEB_BASE}`);
  console.log(`  API: ${API_BASE}`);
  console.log(`  Output: ${path.relative(REPO_ROOT, OUTPUT_ROOT)}`);
  console.log('');

  ensureDir(OUTPUT_ROOT);

  // --- Phase 1: Filesystem scan ---
  console.log('Phase 1: Scanning filesystem assets …');
  const inventory = buildInventory();

  const inventoryPath = path.join(OUTPUT_ROOT, 'inventory.json');
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2), 'utf8');

  const totalMockFiles = [
    ...inventory.mockImages.generated,
    ...inventory.mockImages.generic,
    ...inventory.mockImages.marketplace,
    ...inventory.mockImages.sports,
    ...inventory.mockImages.profileAvatars,
    ...inventory.mockImages.photoreal.flatMap((c) => c.files),
  ].length;

  console.log(`  Brand assets:        ${inventory.brand.length}`);
  console.log(`  Sport icon components: ${inventory.icons.sportIconComponents.length}`);
  console.log(`  Mock images (total): ${totalMockFiles}`);
  console.log(`    generated:         ${inventory.mockImages.generated.length}`);
  console.log(`    generic:           ${inventory.mockImages.generic.length}`);
  console.log(`    marketplace:       ${inventory.mockImages.marketplace.length}`);
  console.log(`    sports (svg):      ${inventory.mockImages.sports.length}`);
  console.log(`    profile avatars:   ${inventory.mockImages.profileAvatars.length}`);
  console.log(`    photoreal:         ${inventory.mockImages.photoreal.reduce((s, c) => s + c.count, 0)} across ${inventory.mockImages.photoreal.length} categories`);
  console.log(`  Inventory: ${path.relative(REPO_ROOT, inventoryPath)}`);

  // --- Phase 2: Playwright renders ---
  console.log('\nPhase 2: Capturing representative renders …');
  console.log(`  Viewport: ${RENDER_VIEWPORT_KEY}`);

  const viewport = VIEWPORT_MATRIX[RENDER_VIEWPORT_KEY];
  const browser = await chromium.launch({ headless: true });
  const renderResults = [];

  try {
    console.log('  Authenticating as 시나로E2E …');
    let authTokens = null;
    try {
      authTokens = await loginViaApi('시나로E2E');
      console.log('  Auth OK');
    } catch (error) {
      console.warn(`  Auth FAILED: ${error.message}`);
      console.warn('  Auth-required renders will attempt unauthenticated access');
    }

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
    });

    const page = await context.newPage();

    for (const target of RENDER_TARGETS) {
      const result = await captureRender(page, target, authTokens);
      renderResults.push(result);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // Attach render results to inventory and re-write
  inventory.renders = {
    viewport: RENDER_VIEWPORT_KEY,
    results: renderResults,
    stats: {
      captured: renderResults.filter((r) => r.status === 'captured').length,
      notFound: renderResults.filter((r) => r.status === 'not-found').length,
      error: renderResults.filter((r) => r.status === 'error').length,
    },
  };
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2), 'utf8');

  console.log('\n--- Summary ---');
  console.log(`  Renders captured:  ${inventory.renders.stats.captured}`);
  console.log(`  Renders not found: ${inventory.renders.stats.notFound}`);
  console.log(`  Renders error:     ${inventory.renders.stats.error}`);
  console.log(`  Full inventory:    ${path.relative(REPO_ROOT, inventoryPath)}`);
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
