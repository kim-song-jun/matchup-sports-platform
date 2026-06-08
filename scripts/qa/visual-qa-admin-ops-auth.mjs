import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = '/Users/sungjun/Documents/projects/matchup-sports-platform/docs/visual-qa/admin-ops/authenticated';
const BASE_URL = 'http://localhost:3013';
const API_URL = 'http://localhost:8121/api/v1';

const BREAKPOINTS = [
  { name: 'mobile-390',   width: 390,  height: 844 },
  { name: 'tablet-768',   width: 768,  height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-2048', width: 2048, height: 900 },
];

const ADMIN_PAGES = [
  { name: 'admin-dashboard',     path: '/admin',                persona: 'owner@teameet.v1' },
  { name: 'admin-matches',       path: '/admin/matches',        persona: 'owner@teameet.v1' },
  { name: 'admin-team-matches',  path: '/admin/team-matches',   persona: 'owner@teameet.v1' },
  { name: 'admin-teams',         path: '/admin/teams',          persona: 'owner@teameet.v1' },
  { name: 'admin-reviews',       path: '/admin/reviews',        persona: 'owner@teameet.v1' },
  { name: 'admin-notifications', path: '/admin/notifications',  persona: 'owner@teameet.v1' },
  { name: 'admin-audit',         path: '/admin/audit',          persona: 'owner@teameet.v1' },
  { name: 'ops-overview',        path: '/ops',                  persona: 'admin@teameet.v1' },
  { name: 'ops-reports',         path: '/ops/reports',          persona: 'admin@teameet.v1' },
  { name: 'ops-disputes',        path: '/ops/disputes',         persona: 'admin@teameet.v1' },
  { name: 'ops-payments',        path: '/ops/payments',         persona: 'admin@teameet.v1' },
  { name: 'ops-settlements',     path: '/ops/settlements',      persona: 'admin@teameet.v1' },
  { name: 'ops-audit',           path: '/ops/audit',            persona: 'admin@teameet.v1' },
];

async function getSession(email) {
  const r = await fetch(`${API_URL}/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const d = await r.json();
  return d.data?.session;
}

const findings = [];
function log(level, page, viewport, msg) {
  const icon = level === 'CRITICAL' ? '🔴' : level === 'WARNING' ? '🟡' : '✅';
  console.log(`  ${icon} [${page}@${viewport}] ${msg}`);
  if (level !== 'OK') findings.push({ level, page, viewport, msg });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`\n🔐 Visual QA — Authenticated Admin/Ops\n   Output: ${OUT_DIR}\n   Total: ${ADMIN_PAGES.length * BREAKPOINTS.length} captures\n`);

  // Pre-fetch sessions
  const sessions = {};
  for (const email of ['owner@teameet.v1', 'admin@teameet.v1']) {
    sessions[email] = await getSession(email);
    console.log(`  Session [${email}]: userId=${sessions[email]?.userId?.slice(0,8)}...`);
  }

  const browser = await chromium.launch({ headless: true });

  for (const bp of BREAKPOINTS) {
    console.log(`\n── ${bp.name} (${bp.width}×${bp.height}) ──`);
    const context = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
    const page = await context.newPage();

    // Seed localStorage with owner session first (most pages use owner)
    await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    const ownerSession = sessions['owner@teameet.v1'];
    if (ownerSession) {
      await page.evaluate(({ id, email }) => {
        localStorage.setItem('teameet.v1.userId', id);
        localStorage.setItem('teameet.v1.userEmail', email);
      }, { id: ownerSession.userId, email: ownerSession.userEmail });
    }

    let currentPersona = 'owner@teameet.v1';

    for (const pageDef of ADMIN_PAGES) {
      // Switch persona if needed
      if (pageDef.persona !== currentPersona) {
        const s = sessions[pageDef.persona];
        if (s) {
          await page.evaluate(({ id, email }) => {
            localStorage.setItem('teameet.v1.userId', id);
            localStorage.setItem('teameet.v1.userEmail', email);
          }, { id: s.userId, email: s.userEmail });
          currentPersona = pageDef.persona;
        }
      }

      const url = `${BASE_URL}${pageDef.path}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);

        const finalUrl = page.url();
        const isLoginRedirected = finalUrl.includes('/login') || finalUrl.includes('/admin/login');
        if (isLoginRedirected) {
          log('WARNING', pageDef.name, bp.name, `Redirected to login: ${finalUrl}`);
        }

        const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
        if (overflow) log('WARNING', pageDef.name, bp.name, `Horizontal overflow`);

        const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
        if (bodyLen < 30) log('CRITICAL', pageDef.name, bp.name, `Nearly blank page (${bodyLen} chars)`);

        const screenshotPath = path.join(OUT_DIR, `${pageDef.name}__${bp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        log('OK', pageDef.name, bp.name, `✓ saved`);
      } catch (e) {
        log('CRITICAL', pageDef.name, bp.name, `Error: ${e.message.slice(0, 80)}`);
      }
    }
    await context.close();
  }
  await browser.close();

  const summary = { timestamp: new Date().toISOString(), findings };
  await writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  const crit = findings.filter(f => f.level === 'CRITICAL').length;
  const warn = findings.filter(f => f.level === 'WARNING').length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 Critical: ${crit}  Warnings: ${warn}`);
  if (findings.length) {
    console.log('\nIssues:');
    findings.forEach(f => console.log(`  ${f.level} [${f.page}@${f.viewport}] ${f.msg}`));
  }
  console.log('═'.repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
