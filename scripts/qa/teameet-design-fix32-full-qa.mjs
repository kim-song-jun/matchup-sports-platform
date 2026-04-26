// Headless QA for Teameet Design prototype fix32.
// Adds canonical-id alias verification on top of fix31 baseline.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix32';
const OUT_DIR = 'output/playwright';
const ARTIFACT_PATH = path.join(OUT_DIR, 'teameet-design-fix32-full-qa.json');

const ID_REGEX =
  /^m(0[1-9]|1[0-9])-(mb|tb|dt)-(main|list|detail|create|edit|state|flow|components|assets|motion)(-([a-z][a-z0-9-]*))?$/;

const EXPECTED_GRID_SECTIONS = [
  'm01-grid','m02-grid','m03-grid','m04-grid','m05-grid',
  'm06-grid','m07-grid','m08-grid','m09-grid','m10-grid',
  'm11-grid','m12-grid','m13-grid','m14-grid','m15-grid',
  'm16-grid','m17-grid','m18-grid','m19-grid',
];

const SCREENSHOT_TARGETS = [
  // canonical-aliased boards (from existing functional sections)
  { id: 'home-a' },           // m02-mb-main-a
  { id: 'm-list' },           // m03-mb-list
  { id: 'tm-detail' },        // m04-mb-detail
  { id: 'lesson-academy-main' }, // m05-mb-list-hub
  { id: 'market' },           // m06-mb-main
  { id: 'merc-list' },        // m08-mb-list (from refresh-merc)
  // m-grid boards (Phase B+C target)
  { id: 'm03-mb-main' }, { id: 'm12-mb-main' }, { id: 'm18-dt-main' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleEvents = [];
  const pageErrors = [];

  page.on('console', (msg) => consoleEvents.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-dc-section]').length > 40, { timeout: 90000 });
  await page.waitForTimeout(3000);

  const metrics = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-dc-section]'));
    const artboards = Array.from(document.querySelectorAll('[data-dc-slot]'));
    const sectionIds = sections.map((el) => el.getAttribute('data-dc-section'));
    const slotIds = artboards.map((el) => el.getAttribute('data-dc-slot'));
    const aliases = artboards
      .map((el) => el.getAttribute('data-canonical-id'))
      .filter((v) => v !== null && v !== undefined);

    const dupSlot = {};
    for (const id of slotIds) dupSlot[id] = (dupSlot[id] || 0) + 1;
    const duplicateSlots = Object.entries(dupSlot).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));

    const dupAlias = {};
    for (const a of aliases) dupAlias[a] = (dupAlias[a] || 0) + 1;
    const duplicateAliases = Object.entries(dupAlias).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));

    const gridIdsByModule = {};
    for (let i = 1; i <= 19; i++) {
      const k = `m${String(i).padStart(2, '0')}`;
      gridIdsByModule[k] = slotIds.filter((id) => id && id.startsWith(`${k}-`)).length;
    }

    const aliasByModule = {};
    for (let i = 1; i <= 19; i++) {
      const k = `m${String(i).padStart(2, '0')}`;
      aliasByModule[k] = aliases.filter((id) => id && id.startsWith(`${k}-`)).length;
    }

    const tmBtn = document.querySelectorAll('.tm-btn').length;
    const tmChip = document.querySelectorAll('.tm-chip').length;
    const tmPressable = document.querySelectorAll('.tm-pressable').length;

    return {
      sectionCount: sections.length,
      sectionIds,
      artboardCount: artboards.length,
      duplicateSlots,
      duplicateAliases,
      aliasCount: aliases.length,
      gridIdsByModule,
      aliasByModule,
      mGridSlotIds: slotIds.filter((id) => id && /^m\d{2}-/.test(id)),
      aliases,
      tmBtn, tmChip, tmPressable,
    };
  });

  const presentGridSections = EXPECTED_GRID_SECTIONS.filter((s) => metrics.sectionIds.includes(s));
  const missingGridSections = EXPECTED_GRID_SECTIONS.filter((s) => !metrics.sectionIds.includes(s));

  const idSchemaViolations = metrics.mGridSlotIds.filter((id) => !ID_REGEX.test(id));
  const aliasSchemaViolations = metrics.aliases.filter((id) => !ID_REGEX.test(id));

  const screenshots = [];
  for (const target of SCREENSHOT_TARGETS) {
    const node = await page.$(`[data-dc-slot="${target.id}"]`).catch(() => null);
    if (!node) continue;
    const dest = path.join(OUT_DIR, `teameet-design-fix32-${target.id}.png`);
    await node.screenshot({ path: dest });
    screenshots.push(dest);
  }

  const unexpectedConsole = consoleEvents.filter((e) => {
    if (e.type !== 'error' && e.type !== 'warning') return false;
    if (/babel.*standalone.*development|in-browser Babel transformer.*precompile/i.test(e.text)) return false;
    return true;
  });

  const pass =
    pageErrors.length === 0 &&
    unexpectedConsole.length === 0 &&
    metrics.duplicateSlots.length === 0 &&
    metrics.duplicateAliases.length === 0 &&
    missingGridSections.length === 0 &&
    idSchemaViolations.length === 0 &&
    aliasSchemaViolations.length === 0 &&
    metrics.aliasCount === 306;

  const artifact = {
    url: URL,
    pass,
    metrics: {
      sectionCount: metrics.sectionCount,
      artboardCount: metrics.artboardCount,
      duplicateSlots: metrics.duplicateSlots,
      duplicateAliases: metrics.duplicateAliases,
      aliasCount: metrics.aliasCount,
      gridIdsByModule: metrics.gridIdsByModule,
      aliasByModule: metrics.aliasByModule,
      mGridTotalCount: metrics.mGridSlotIds.length,
      tmBtn: metrics.tmBtn, tmChip: metrics.tmChip, tmPressable: metrics.tmPressable,
    },
    presentGridSections,
    missingGridSections,
    idSchemaViolations,
    aliasSchemaViolations,
    pageErrors,
    unexpectedConsole,
    screenshots,
  };

  await writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({
    pass,
    sections: metrics.sectionCount,
    artboards: metrics.artboardCount,
    aliasCount: metrics.aliasCount,
    expectedAliasCount: 306,
    mGridArtboards: metrics.mGridSlotIds.length,
    perModuleGrid: metrics.gridIdsByModule,
    perModuleAlias: metrics.aliasByModule,
    idSchemaViolations: idSchemaViolations.length,
    aliasSchemaViolations: aliasSchemaViolations.length,
    duplicateSlots: metrics.duplicateSlots.length,
    duplicateAliases: metrics.duplicateAliases.length,
    pageErrors: pageErrors.length,
    unexpectedConsole: unexpectedConsole.length,
    screenshots: screenshots.length,
    artifact: ARTIFACT_PATH,
  }, null, 2));

  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
