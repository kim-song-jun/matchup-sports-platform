import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Visual fixture QA only: no server mutations or live-user data.
const out = 'output/playwright/visual-audit/own-goal-team-label';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: false });
const issues = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) issues.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/record')) {
      await route.fulfill({ status: 200, json: { status: 'success', data: null } });
      return;
    }
    await route.fulfill({ json: { status: 'success', data: {
      teamMatchId: 'fixture', title: '자책골 소속 표시 QA', phase: 'official', version: 10,
      startsAt: '2026-09-24T04:11:00Z', serverTime: new Date().toISOString(),
      canEdit: false, participant: true, ownSideId: 'home', lineupReady: true, missingSides: [],
      sides: [{ id: 'home', key: 'HOME', name: '한강 로버스', score: 0 }, { id: 'away', key: 'AWAY', name: '마포 레인저스', score: 2 }],
      participants: [{ id: 'h1', sideId: 'home', name: '한강테스트05', jerseyNumber: 5, profileImageUrl: null }, { id: 'a1', sideId: 'away', name: '강현우', jerseyNumber: 10, profileImageUrl: null }],
      goals: [{ id: 'g1', sideId: 'away', participantId: 'a1', ownGoal: false, minute: null, subMatchId: null }, { id: 'g2', sideId: 'away', participantId: 'h1', ownGoal: true, minute: null, subMatchId: null }],
      goalEvents: [], subMatches: [], confirmations: [], history: [], officialAt: '2026-09-30T01:41:13Z',
    } } });
  });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:3013/team-matches/fixture/record', { waitUntil: 'domcontentloaded' });
    const row = page.getByRole('group', { name: '한강테스트05 득점 기록' });
    await row.waitFor({ timeout: 90000 });
    if (await row.getByText('한강 로버스', { exact: true }).count() !== 1) throw new Error('Wrong player affiliation');
    if (await row.getByText('마포 레인저스 득점으로 반영').count() !== 1) throw new Error('Missing credited-team copy');
    await row.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error(`Horizontal overflow at ${width}`);
    await page.screenshot({ path: `${out}/${width}.png`, fullPage: true });
    console.log(`PASS ${width}: affiliation, credited team, no horizontal overflow`);
  }
  await writeFile(`${out}/issues.json`, JSON.stringify(issues, null, 2));
  if (issues.length) throw new Error(JSON.stringify(issues));
} finally {
  await browser.close();
}
