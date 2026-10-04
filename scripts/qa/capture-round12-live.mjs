/** Read-only deployed alpha QA: no sample injection, fixture writes or auth bypass. */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'https://alpha.teameet.co.kr';
const expectedSha = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '')) throw new Error('Pass the deployed merge SHA.');
const headers = await fetch(`${base}/landing`, { method: 'HEAD' });
const actualSha = headers.headers.get('x-teameet-commit');
if (actualSha !== expectedSha) throw new Error(`Alpha release mismatch: ${actualSha}`);
const practiceId = 'ad120000-0000-4000-8000-000000000001';
const response = await fetch(`${base}/api/v1/tournaments/${practiceId}`);
if (!response.ok) throw new Error(`Practice tournament API ${response.status}`);
const { data } = await response.json();
if (data.confirmedCount !== 12 || data.participantTeams.length !== 12 || data.participantTeams.some((team) => team.status !== 'confirmed' || team.players.length !== 5) || data.groups.length || data.fixtures.length) throw new Error('Practice tournament differs from requested 12 × 5, blank bracket.');
const output = 'output/playwright/visual-audit/20261005-round12-live';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: false });
console.log(`Owned headed browser parent ${process.pid}`);
console.log(execFileSync('ps', ['--ppid', String(process.pid), '-o', 'pid,ppid,comm'], { encoding: 'utf8' }));
const evidence = { sha: actualSha, title: data.title, teams: 12, players: 60, groups: 0, fixtures: 0, viewports: [] };
try {
  for (const [viewport, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 1000]]) {
    for (const [name, id] of [['requested', 'd209a886-1a38-44ab-90a7-d08009aeee16'], ['practice', practiceId]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage(); const errors = []; const consoleErrors = []; const failures = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('response', (result) => { if (result.url().startsWith(base) && result.status() >= 400) failures.push({ url: result.url(), status: result.status() }); });
      await page.goto(`${base}/tournaments/${id}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#participant-teams-heading').waitFor();
      await page.waitForTimeout(800);
      let rosters = 0;
      if (name === 'practice') {
        for (const team of data.participantTeams) {
          const toggle = page.getByRole('button', { name: `${team.teamName} 명단 펼치기`, exact: true });
          const rosterId = await toggle.getAttribute('aria-controls');
          await toggle.click();
          const roster = page.locator(`[id="${rosterId}"]`);
          await roster.waitFor();
          if (await roster.locator('li').count() !== 5) throw new Error(`Roster count: ${team.teamName}`);
          for (const player of team.players) await roster.getByText(player.nickname, { exact: true }).waitFor();
          rosters += 1;
          await page.getByRole('button', { name: `${team.teamName} 명단 접기`, exact: true }).click();
        }
        await page.getByRole('button', { name: `${data.participantTeams[0].teamName} 명단 펼치기`, exact: true }).click();
      }
      await page.evaluate(() => scrollTo(0, 0));
      const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, paths: document.querySelectorAll('svg[aria-label="경기별 진출 연결선"] path').length }));
      await page.screenshot({ path: `${output}/${name}-${viewport}.png`, fullPage: true });
      if (name === 'requested') {
        const graph = page.locator('[role="region"][aria-label="결선 대진표"]');
        await graph.scrollIntoViewIfNeeded();
        await graph.screenshot({ path: `${output}/graph-${viewport}.png` });
      }
      evidence.viewports.push({ name, viewport, width, height, url: page.url(), rosters, errors, consoleErrors, failures, ...metrics });
      await context.close();
      if (errors.length || metrics.overflow > 0) throw new Error(`Live ${name}/${viewport}: ${JSON.stringify({ errors, metrics })}`);
    }
  }
} finally { await browser.close(); await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2)); }
console.log(JSON.stringify(evidence, null, 2));
