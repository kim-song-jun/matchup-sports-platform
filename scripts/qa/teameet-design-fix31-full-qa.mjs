// Headless QA for Teameet Design prototype fix31.
// Verifies all M01~M19 viewport grid sections + ID schema compliance.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix31';
const OUT_DIR = 'output/playwright';
const ARTIFACT_PATH = path.join(OUT_DIR, 'teameet-design-fix31-full-qa.json');

const ID_REGEX = /^m(0[1-9]|1[0-9])-(mb|tb|dt)-(main|list|detail|create|edit|state|flow|components|assets|motion)(-([a-z][a-z0-9-]*))?$/;

const EXPECTED_GRID_SECTIONS = [
  'm01-grid', 'm02-grid', 'm03-grid', 'm04-grid', 'm05-grid',
  'm06-grid', 'm07-grid', 'm08-grid', 'm09-grid', 'm10-grid',
  'm11-grid', 'm12-grid', 'm13-grid', 'm14-grid', 'm15-grid',
  'm16-grid', 'm17-grid', 'm18-grid', 'm19-grid',
];

const SCREENSHOT_TARGETS = [
  // 5 representative samples spanning M03~M18
  { id: 'm03-mb-main' }, { id: 'm04-dt-main' }, { id: 'm06-mb-detail' },
  { id: 'm09-dt-main' }, { id: 'm12-mb-main' }, { id: 'm14-mb-flow-checkout' },
  { id: 'm17-dt-main' }, { id: 'm18-dt-main' },
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

    const dupCount = {};
    for (const id of slotIds) dupCount[id] = (dupCount[id] || 0) + 1;
    const duplicateSlots = Object.entries(dupCount).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));

    const gridIdsByModule = {};
    for (let i = 1; i <= 19; i++) {
      const k = `m${String(i).padStart(2, '0')}`;
      gridIdsByModule[k] = slotIds.filter((id) => id && id.startsWith(`${k}-`)).length;
    }

    const tmBtn = document.querySelectorAll('.tm-btn').length;
    const tmChip = document.querySelectorAll('.tm-chip').length;
    const tmPressable = document.querySelectorAll('.tm-pressable').length;

    return {
      sectionCount: sections.length,
      sectionIds,
      artboardCount: artboards.length,
      duplicateSlots,
      gridIdsByModule,
      mGridSlotIds: slotIds.filter((id) => id && /^m\d{2}-/.test(id)),
      tmBtn, tmChip, tmPressable,
    };
  });

  const presentGridSections = EXPECTED_GRID_SECTIONS.filter((s) => metrics.sectionIds.includes(s));
  const missingGridSections = EXPECTED_GRID_SECTIONS.filter((s) => !metrics.sectionIds.includes(s));

  const idSchemaViolations = metrics.mGridSlotIds.filter((id) => !ID_REGEX.test(id));

  const screenshots = [];
  for (const target of SCREENSHOT_TARGETS) {
    const node = await page.$(`[data-dc-slot="${target.id}"]`).catch(() => null);
    if (!node) continue;
    const dest = path.join(OUT_DIR, `teameet-design-fix31-${target.id}.png`);
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
    missingGridSections.length === 0 &&
    idSchemaViolations.length === 0;

  const artifact = {
    url: URL,
    pass,
    metrics: {
      sectionCount: metrics.sectionCount,
      artboardCount: metrics.artboardCount,
      duplicateSlots: metrics.duplicateSlots,
      gridIdsByModule: metrics.gridIdsByModule,
      mGridTotalCount: metrics.mGridSlotIds.length,
      tmBtn: metrics.tmBtn, tmChip: metrics.tmChip, tmPressable: metrics.tmPressable,
    },
    presentGridSections,
    missingGridSections,
    idSchemaViolations,
    pageErrors,
    unexpectedConsole,
    screenshots,
  };

  await writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({
    pass,
    sections: metrics.sectionCount,
    artboards: metrics.artboardCount,
    mGridSections: presentGridSections.length,
    missingGridSections: missingGridSections,
    mGridArtboards: metrics.mGridSlotIds.length,
    perModule: metrics.gridIdsByModule,
    idSchemaViolations: idSchemaViolations.length,
    duplicateSlots: metrics.duplicateSlots.length,
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
