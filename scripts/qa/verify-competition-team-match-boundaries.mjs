// Read-only live Alpha QA. Run from the repository root with a headed display:
// QA_STAGE=after QA_KIND=tournament QA_EXPECTED_COMMIT=<deployed-sha> node scripts/qa/verify-competition-team-match-boundaries.mjs
// QA_KIND=league verifies the positive control; before captures a baseline.
// Sample IDs are cached only under /tmp. No authentication or mutations are used.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = 'https://alpha.teameet.co.kr';
const stage = process.env.QA_STAGE ?? 'before';
const kind = process.env.QA_KIND ?? 'tournament';
if (!['before', 'after'].includes(stage) || !['league', 'tournament'].includes(kind)) throw new Error('Unsupported QA stage or kind');
const league = kind === 'league';
const sampleFile = `/tmp/teameet-competition-alpha-${kind}-sample.json`;
const out = `output/playwright/visual-audit/competition-team-match-${kind}-${stage}`;
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const report = { stage, kind, capturedAt: new Date().toISOString(), pages: [], api: [], pids: [], browserClosed: false };
const landing = await fetch(`${base}/landing`);
report.deployment = { status: landing.status, commit: landing.headers.get('x-teameet-commit'), release: landing.headers.get('x-teameet-release') };
await landing.arrayBuffer();
if (!landing.ok || (process.env.QA_EXPECTED_COMMIT && report.deployment.commit !== process.env.QA_EXPECTED_COMMIT)) throw new Error('Alpha deployment identity did not match the expected commit');
async function get(path) {
  await sleep(750);
  const response = await fetch(`${base}/api/v1${path}`);
  report.api.push({ path, status: response.status });
  if (!response.ok) throw new Error(`API ${path} returned ${response.status}`);
  return (await response.json()).data;
}
let sample;
if (stage === 'after' && existsSync(sampleFile)) {
  sample = JSON.parse(readFileSync(sampleFile, 'utf8'));
  const schedule = await get(league ? `/league-matches/${sample.tournamentId}` : `/tournaments/${sample.tournamentId}/schedule`);
  const fixtures = league ? schedule.fixtures : schedule.items;
  if (!fixtures.length) throw new Error('Public fixture disappeared after deployment');
  sample.fixtureId = league ? fixtures[0].teamMatchId : fixtures[0].fixtureId;
}
else {
  const tournaments = await get(league ? '/league-matches?limit=20' : '/tournaments?limit=20');
  for (const tournament of tournaments.items) {
    const id = league ? tournament.leagueId : tournament.id;
    const schedule = await get(league ? `/league-matches/${id}` : `/tournaments/${id}/schedule`);
    const fixtures = league ? schedule.fixtures : schedule.items;
    if (!fixtures.length) continue;
    sample = { tournamentId: id, fixtureId: league ? fixtures[0].teamMatchId : fixtures[0].fixtureId };
    break;
  }
  if (!sample) throw new Error('No public tournament fixture for record handoff QA');
  writeFileSync(sampleFile, JSON.stringify(sample));
}
const detail = await get(league ? `/league-matches/${sample.tournamentId}/fixtures/${sample.fixtureId}/record` : `/tournaments/${sample.tournamentId}/matches/${sample.fixtureId}`);
const record = await get(`/team-matches/${sample.fixtureId}/record`);
report.record = { phase: record.phase, canEdit: record.canEdit, leagueId: record.leagueId ?? null, tournamentId: record.tournamentId ?? null };
if (record.phase !== 'managed' || record.canEdit !== false) throw new Error('Anonymous competition record must remain managed and read-only');
if (stage === 'after' && (league ? record.leagueId !== sample.tournamentId : record.leagueId !== null || record.tournamentId !== sample.tournamentId)) throw new Error('Competition ownership projection is incorrect');
report.pid = process.pid;
let browser;
try {
  browser = await chromium.launch({ headless: false });
  const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm'], {encoding:'utf8'}).trim().split('\n').slice(1).map(line => {
    const [pid, ppid, comm] = line.trim().split(/\s+/); return {pid:Number(pid),ppid:Number(ppid),comm};
  });
  const own = new Set([process.pid]);
  for (let n=0;n<10;n++) for (const row of rows) if (own.has(row.ppid)) own.add(row.pid);
  report.pids = rows.filter(row => own.has(row.pid));
  for (const [width, height] of [[390,844],[768,1024],[1440,900]]) {
    const context = await browser.newContext({viewport:{width,height},locale:'ko-KR'});
    const page = await context.newPage();
    const errors = [];
    const network = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(base)) network.push({path:new URL(response.url()).pathname,status:response.status()});
    });
    const source = league && stage === 'after' ? '/tournaments?kind=league' : league ? '/league-matches' : '/tournaments';
    await page.goto(`${base}/team-matches/${sample.fixtureId}/record?from=${encodeURIComponent(source)}`, {waitUntil:'domcontentloaded'});
    await sleep(6000);
    const url = new URL(page.url());
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      text: document.body.innerText.slice(0,2500),
    }));
    const expected = league ? `/league-matches/${sample.tournamentId}/fixtures/${sample.fixtureId}` : `/tournaments/${sample.tournamentId}/matches/${sample.fixtureId}`;
    let passed = url.pathname === expected && url.searchParams.get('from') === source && !layout.text.includes('페이지를 찾을 수 없어요') && [detail.home?.teamName, detail.away?.teamName].every(name => !!name && layout.text.includes(name)) && layout.text.includes('라인업');
    await page.screenshot({path:`${out}/public-record-${width}.png`,fullPage:true});
    let backPassed = null;
    if (stage === 'after') {
      const back = page.locator('a[data-nav-back="true"]:visible').first();
      await back.waitFor({state:'visible',timeout:10000});
      await back.click();
      const destination = new URL(source, base);
      await page.waitForURL(url => url.pathname === destination.pathname && url.searchParams.get('kind') === destination.searchParams.get('kind'), {timeout:10000});
      backPassed = true;
      passed = passed && backPassed;
    }
    const expectedAuth = network.filter(response => response.path === '/api/v1/auth/me' && response.status === 401);
    const unexpectedNetwork = network.filter(response => !(response.path === '/api/v1/auth/me' && response.status === 401));
    const unexpectedErrors = errors.filter(error => !(expectedAuth.length && error.startsWith('console:') && error.includes('status of 401')));
    report.pages.push({width,pathname:url.pathname,expected,source:url.searchParams.get('from'),passed,backPassed,layout,errors,network,expectedAuth,unexpectedNetwork,unexpectedErrors});
    await context.close();
  }
} finally {
  await browser?.close();
  report.browserClosed = true;
  writeFileSync(`${out}/report.json`, JSON.stringify(report,null,2));
}
console.log(JSON.stringify({stage,recordPhase:report.record.phase,pages:report.pages.map(({width,passed,layout,errors,network})=>({width,passed,overflow:layout.scrollWidth>width,errors,network})),browserClosed:true}));
if (stage === 'after' && report.pages.some(page => !page.passed || page.unexpectedErrors.length || page.unexpectedNetwork.length || page.layout.scrollWidth > page.width)) process.exitCode = 1;
