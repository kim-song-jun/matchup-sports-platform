// Headless QA for Teameet Design prototype fix28.
// Verifies the new 00n · Prototype Audit Summary section + carries fix27 verifications forward.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix28';
const OUT_DIR = 'output/playwright';
const ARTIFACT_PATH = path.join(OUT_DIR, 'teameet-design-fix28-full-qa.json');
const SCREENSHOT_TARGETS = [
  { id: 'audit-summary', file: 'teameet-design-fix28-audit-summary.png' },
  { id: 'audit-token-score', file: 'teameet-design-fix28-audit-token-score.png' },
  { id: 'audit-viewport-matrix', file: 'teameet-design-fix28-audit-viewport-matrix.png' },
  { id: 'audit-module-heatmap', file: 'teameet-design-fix28-audit-module-heatmap.png' },
  { id: 'audit-readiness', file: 'teameet-design-fix28-audit-readiness.png' },
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

    const has00k = sectionIds.includes('design-system-foundation');
    const has00l = sectionIds.includes('dev-handoff');
    const has00m = sectionIds.includes('dev-handoff-2');
    const has00n = sectionIds.includes('prototype-audit');

    const auditIds = ['audit-summary', 'audit-token-score', 'audit-viewport-matrix', 'audit-module-heatmap', 'audit-readiness'];
    const auditBoards = artboards.filter((el) => auditIds.includes(el.getAttribute('data-dc-slot')));

    const tmBtn = document.querySelectorAll('.tm-btn').length;
    const tmChip = document.querySelectorAll('.tm-chip').length;
    const tmPressable = document.querySelectorAll('.tm-pressable').length;

    const allowAdminSidebar = (el) => {
      let cur = el;
      while (cur && cur !== document.body) {
        if (cur.classList && cur.classList.contains('tm-admin-sidebar')) return true;
        cur = cur.parentElement;
      }
      return false;
    };
    const darkSlots = [];
    for (const el of artboards) {
      const cls = el.className || '';
      const style = el.getAttribute('style') || '';
      const looksDark = cls.includes('dark') || /background-color:\s*#0|background:\s*#0|background:\s*rgb\(0,/i.test(style);
      if (looksDark && !allowAdminSidebar(el)) darkSlots.push(el.getAttribute('data-dc-slot'));
    }

    let suspiciousCount = 0;
    for (const el of document.querySelectorAll('div[style], span[style]')) {
      const style = el.getAttribute('style') || '';
      if (style.includes('overflow') && style.includes('text-overflow') && style.includes('white-space')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 60 && rect.height < 30 && el.textContent && el.textContent.trim().length > 12) {
          suspiciousCount++;
        }
      }
    }

    return {
      sectionCount: sections.length,
      artboardCount: artboards.length,
      has00k,
      has00l,
      has00m,
      has00n,
      auditBoardCount: auditBoards.length,
      tmBtn,
      tmChip,
      tmPressable,
      duplicateSlots,
      darkSlots,
      suspiciousCount,
    };
  });

  const screenshots = [];
  for (const target of SCREENSHOT_TARGETS) {
    const node = await page.$(`[data-dc-slot="${target.id}"]`).catch(() => null);
    if (!node) continue;
    const dest = path.join(OUT_DIR, target.file);
    await node.screenshot({ path: dest });
    screenshots.push(dest);
  }

  const unexpectedConsole = consoleEvents.filter((e) => {
    if (e.type !== 'error' && e.type !== 'warning') return false;
    if (/babel.*standalone.*development|Browser stand-alone|preset-env.*production|in-browser Babel transformer.*precompile/i.test(e.text)) return false;
    return true;
  });

  const pass =
    pageErrors.length === 0 &&
    unexpectedConsole.length === 0 &&
    metrics.duplicateSlots.length === 0 &&
    metrics.darkSlots.length === 0 &&
    metrics.has00k &&
    metrics.has00l &&
    metrics.has00m &&
    metrics.has00n &&
    metrics.auditBoardCount === 5;

  const artifact = {
    url: URL,
    pass,
    metrics,
    pageErrors,
    unexpectedConsole,
    screenshots,
  };

  await writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify(artifact, null, 2));

  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
