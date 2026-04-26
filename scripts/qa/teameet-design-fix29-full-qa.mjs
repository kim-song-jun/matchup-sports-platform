// Headless QA for Teameet Design prototype fix29.
// Verifies M01·M02 viewport grid POC + ID schema compliance.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix29';
const OUT_DIR = 'output/playwright';
const ARTIFACT_PATH = path.join(OUT_DIR, 'teameet-design-fix29-full-qa.json');

const ID_REGEX = /^m(0[1-9]|1[0-9])-(mb|tb|dt)-(main|list|detail|create|edit|state|flow|components|assets|motion)(-([a-z][a-z0-9-]*))?$/;

const SCREENSHOT_TARGETS = [
  // M01 — 4 representative
  { id: 'm01-mb-main' }, { id: 'm01-tb-main' }, { id: 'm01-dt-main' },
  { id: 'm01-mb-state-error' }, { id: 'm01-mb-components' }, { id: 'm01-mb-assets' },
  // M02 — 4 representative
  { id: 'm02-mb-main' }, { id: 'm02-tb-main' }, { id: 'm02-dt-main' },
  { id: 'm02-mb-state-empty' }, { id: 'm02-mb-state-loading' }, { id: 'm02-mb-components' }, { id: 'm02-mb-assets' },
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
  await page.waitForFunction(() => document.querySelectorAll('[data-dc-section]').length > 30, { timeout: 60000 });
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-dc-section]'));
    const artboards = Array.from(document.querySelectorAll('[data-dc-slot]'));
    const sectionIds = sections.map((el) => el.getAttribute('data-dc-section'));
    const slotIds = artboards.map((el) => el.getAttribute('data-dc-slot'));

    const dupCount = {};
    for (const id of slotIds) dupCount[id] = (dupCount[id] || 0) + 1;
    const duplicateSlots = Object.entries(dupCount).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));

    const has00n = sectionIds.includes('prototype-audit');
    const hasM01Grid = sectionIds.includes('m01-grid');
    const hasM02Grid = sectionIds.includes('m02-grid');

    const m01Boards = slotIds.filter((id) => id && id.startsWith('m01-'));
    const m02Boards = slotIds.filter((id) => id && id.startsWith('m02-'));

    const tmBtn = document.querySelectorAll('.tm-btn').length;
    const tmChip = document.querySelectorAll('.tm-chip').length;
    const tmPressable = document.querySelectorAll('.tm-pressable').length;

    return {
      sectionCount: sections.length,
      artboardCount: artboards.length,
      has00n,
      hasM01Grid,
      hasM02Grid,
      m01BoardIds: m01Boards,
      m02BoardIds: m02Boards,
      tmBtn,
      tmChip,
      tmPressable,
      duplicateSlots,
    };
  });

  // ID schema validation: only m{NN}-* boards must match the regex.
  const idSchemaViolations = [...metrics.m01BoardIds, ...metrics.m02BoardIds].filter((id) => !ID_REGEX.test(id));

  // Screenshots — only for boards that resolve.
  const screenshots = [];
  for (const target of SCREENSHOT_TARGETS) {
    const node = await page.$(`[data-dc-slot="${target.id}"]`).catch(() => null);
    if (!node) continue;
    const dest = path.join(OUT_DIR, `teameet-design-fix29-${target.id}.png`);
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
    metrics.has00n &&
    metrics.hasM01Grid &&
    metrics.hasM02Grid &&
    metrics.m01BoardIds.length >= 13 &&
    metrics.m02BoardIds.length >= 15 &&
    idSchemaViolations.length === 0;

  const artifact = {
    url: URL,
    pass,
    metrics,
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
    m01Boards: metrics.m01BoardIds.length,
    m02Boards: metrics.m02BoardIds.length,
    idSchemaViolations: idSchemaViolations.length,
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
