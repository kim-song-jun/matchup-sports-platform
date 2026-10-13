// Read-only headed Alpha evidence. No credentials or storage state are persisted.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function main() {
  const origin = 'https://alpha.teameet.co.kr';
  const stage = process.env.QA_STAGE || 'before';
  const output = process.env.QA_OUTPUT_DIR;
  if (!output) throw new Error('QA_OUTPUT_DIR is required');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: false, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  console.log('Owned browser parent:', process.pid);
  console.log(process.platform === 'win32'
    ? execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${process.pid} } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`], { encoding: 'utf8' }).trim()
    : execFileSync('ps', ['--ppid', String(process.pid), '-o', 'pid,ppid,comm'], { encoding: 'utf8' }).trim());
  const evidence = { origin, stage, errors: [], networkErrors: [], viewports: [] };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
    page.on('response', response => {
      if (response.status() >= 400 && /\/api\/v1\/(team-matches|admin\/team-matches)/.test(response.url())) {
        evidence.networkErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
      }
    });
    const list = await context.request.get(`${origin}/api/v1/team-matches?limit=50`);
    if (!list.ok()) throw new Error(`Public list HTTP ${list.status()}`);
    const { data } = await list.json();
    const items = data.items;
    evidence.publicStatuses = [...new Set(items.map(item => item.status))];
    const match = process.env.QA_TEAM_MATCH_ID ? { teamMatchId: process.env.QA_TEAM_MATCH_ID } : items.find(item => !item.leagueId && !item.tournamentId);
    if (!match) throw new Error('No public team match available');
    evidence.teamMatchId = match.teamMatchId;
    const detail = await context.request.get(`${origin}/api/v1/team-matches/${match.teamMatchId}`);
    if (!detail.ok()) throw new Error(`Public detail HTTP ${detail.status()}`);
    evidence.detailStatus = (await detail.json()).data.status;
    if (stage === 'after' && (evidence.detailStatus === 'on_hold' || evidence.publicStatuses.some(status => ['on_hold', 'cancelled'].includes(status)))) throw new Error('Removed status exposed by public API');
    const capture = async (name, route) => {
      await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading').first().waitFor();
      await page.waitForTimeout(1500);
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(output, `${stage}-${name}-${width}.png`), fullPage: name !== 'admin' });
        evidence.viewports.push({ name, width, route: page.url(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), holdLabels: await page.getByText('보류', { exact: true }).count() });
      }
    };
    if (process.env.QA_ONLY_ADMIN !== '1') {
      await capture('list', '/team-matches');
      await capture('detail', `/team-matches/${match.teamMatchId}`);
    }
    if (process.env.QA_ADMIN_EMAIL && process.env.QA_ADMIN_PASSWORD) {
      await page.goto(`${origin}/login/email?redirect=%2Fadmin%2Fteam-matches`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('이메일', { exact: true }).fill(process.env.QA_ADMIN_EMAIL);
      await page.getByLabel('비밀번호', { exact: true }).fill(process.env.QA_ADMIN_PASSWORD);
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/admin/team-matches');
      await capture('admin', '/admin/team-matches');
      const cancelled = await context.request.get(`${origin}/api/v1/admin/team-matches?status=cancelled`);
      if (!cancelled.ok()) throw new Error(`Admin cancelled list HTTP ${cancelled.status()}`);
      const cancelledMatch = (await cancelled.json()).data.items.find(item => !item.league && !item.tournament);
      if (cancelledMatch) {
        const adminDetail = await context.request.get(`${origin}/api/v1/admin/team-matches/${cancelledMatch.teamMatchId}`);
        const publicDetail = await context.request.get(`${origin}/api/v1/team-matches/${cancelledMatch.teamMatchId}`);
        evidence.cancelledVisibility = { teamMatchId: cancelledMatch.teamMatchId, adminHttp: adminDetail.status(), publicHttp: publicDetail.status() };
        if (stage === 'after' && (!adminDetail.ok() || publicDetail.status() !== 404)) throw new Error('Cancelled visibility contract failed');
      }
    }
  } finally {
    try { await fs.writeFile(path.join(output, `${stage}${process.env.QA_ONLY_ADMIN === '1' ? '-admin' : ''}-evidence.json`), JSON.stringify(evidence, null, 2)); }
    finally { await browser.close(); }
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
