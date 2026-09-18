/** Local-only real API/DB + headed browser QA. Never targets alpha/production. */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const requireApi = createRequire(path.resolve('apps/v1_api/package.json'));
const { PrismaClient } = requireApi('@prisma/client');
const dbUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || !['55432', '55433'].includes(dbUrl.port) || dbUrl.pathname !== '/v1_migrate_check') throw new Error('Only the task-local QA database on port 55432/55433 is allowed');
const db = new PrismaClient();
const output = path.resolve('output/playwright/visual-audit/personal-participation');
await mkdir(output, { recursive: true });
const manifest = path.join(output, 'fixture.json');
const api = async (user, route, body) => {
  const response = await fetch(`http://127.0.0.1:8121/api/v1${route}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-v1-user-id': user } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(result)}`);
  return result.data;
};
if (process.argv[2] === 'setup') {
  const host = randomUUID(), member = randomUUID();
  const sport = await db.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
  const region = await db.v1Region.create({ data: { code: `personal-qa-${host}`, name: '성동구', level: 2 } });
  const termsPolicy = await db.v1ManagedTermsPolicy.create({
    data: { code: `personal-qa-${host}`, name: '개인 매치 브라우저 QA 필수 약관' },
  });
  await db.v1ManagedTermsDocument.create({ data: {
    policyId: termsPolicy.id, version: '1', title: '개인 매치 브라우저 QA 필수 약관',
    content: '개인 매치 브라우저 QA 전용 약관입니다.', contentHash: `personal-qa-${host}`,
    status: 'published', publishedAt: new Date(), effectiveAt: new Date(),
  } });
  await db.v1ManagedTermsPlacement.create({
    data: { policyId: termsPolicy.id, context: 'signup', requirement: 'required', displayOrder: 0 },
  });
  const terms = await api(null, '/terms/current?context=signup');
  for (const [id, name] of [[host, '이서준'], [member, '김민준']]) {
    const phone = `010${id.replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}`;
    await db.v1User.create({ data: { id, email: `${id}@qa.teameet.test`, accountStatus: 'active', onboardingStatus: 'completed', phone, phoneVerifiedAt: new Date(), profile: { create: { nickname: name, realName: name, gender: 'male' } } } });
    await api(id, '/terms/consents', { documentIds: terms.items.filter(x => x.requirement === 'required').map(x => x.documentId) });
  }
  const make = async title => {
    const m = await api(host, '/matches', { title, sportId: sport.id, regionId: region.id, manualPlaceName: '성수 실내 풋살장', addressText: '서울 성동구 성수동', capacity: 10, description: '승패보다 함께 운동하는 즐거움! 편하게 참여해 주세요.', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 93600000).toISOString(), genderRule: '성별 무관' });
    const a = await api(member, `/matches/${m.matchId}/applications`, {});
    await api(host, `/match-applications/${a.applicationId}/approve`, {});
    return m.matchId;
  };
  const upcoming = await make('퇴근 후 가볍게, 성수 풋살');
  const ended = await make('함께 뛴 저녁 풋살 · 참여 확정');
  const completed = await make('주말 아침 풋살 · 참여 완료');
  for (const id of [ended, completed]) await db.v1Match.update({ where: { id }, data: { startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) } });
  await api(host, `/matches/${completed}/complete`, {});
  // Historical fixture rows verify page 2; real actions above verify lifecycle persistence.
  for (let i = 1; i <= 51; i++) await db.v1Match.create({ data: {
    hostUserId: host, sportId: sport.id, regionId: region.id, title: `함께한 풋살 ${i}회`, placeName: '성수 실내 풋살장', maxParticipants: 10,
    startAt: new Date(Date.now() - (i + 2) * 86400000), status: 'completed', completedAt: new Date(Date.now() - (i + 2) * 86400000 + 7200000),
    participants: { create: [{ userId: host, role: 'host', status: 'completed', completedAt: new Date() }, { userId: member, role: 'participant', status: 'completed', completedAt: new Date() }] },
  } });
  await writeFile(manifest, JSON.stringify({ host, member, upcoming, ended, completed }, null, 2));
  console.log('Created isolated QA fixtures');
  await db.$disconnect();
  process.exit(0);
}
const data = JSON.parse(await readFile(manifest, 'utf8'));
const stage = process.argv[2] ?? 'after';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const cdpUrl = process.env.PLAYWRIGHT_CDP_URL;
const browser = cdpUrl
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({ headless: false, ...(executablePath ? { executablePath } : {}) });
const report = { stage, browser: 'headed Chromium', runnerPid: process.pid, executablePath: cdpUrl ? `cdp:${cdpUrl}` : executablePath ?? 'playwright-managed', consoleErrors: [], networkErrors: [], screenshots: [], actions: [] };
async function contextFor(user, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, locale: 'ko-KR', reducedMotion: 'reduce' });
  await context.addInitScript(id => { localStorage.setItem('teameet.v1.userId', id); localStorage.setItem('teameet.v1.session', 'active'); }, user);
  const page = await context.newPage();
  page.on('pageerror', e => report.consoleErrors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/v1')) report.networkErrors.push({ status: r.status(), url: r.url() }); });
  const hydrated = page.waitForResponse(r => r.url().includes('/api/v1/auth/me') && r.status() === 200);
  await page.goto('http://127.0.0.1:3013/home');
  await hydrated;
  await page.locator('body').waitFor();
  return { context, page };
}
async function capture(page, name, width, fullPage = true) {
  await page.addStyleTag({ content: 'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, `${name}/${width} horizontal overflow`);
  const file = `${stage}-${name}-${width}.png`;
  await page.screenshot({ path: path.join(output, file), fullPage });
  report.screenshots.push({ file, width, overflow, route: new URL(page.url()).pathname });
}
try {
  for (const width of [390, 768, 1440]) {
    const h = await contextFor(data.host, width);
    await h.page.goto(`http://127.0.0.1:3013/matches/${data.ended}`);
    await h.page.getByRole('link', { name: '신청자 관리', exact: true }).filter({ visible: true }).waitFor();
    await capture(h.page, 'host-completion', width);
    await h.page.getByRole('button', { name: '경기 완료', exact: true }).filter({ visible: true }).scrollIntoViewIfNeeded();
    await capture(h.page, 'host-completion-action', width, false);
    await h.page.getByRole('link', { name: '신청자 관리', exact: true }).filter({ visible: true }).click();
    await h.page.waitForURL(`**/matches/${data.ended}/applications`);
    if (stage === 'after') {
      await h.page.getByRole('button', { name: '확정 명단', exact: true }).click();
      await h.page.getByText('김민준', { exact: true }).waitFor();
    } else await h.page.getByText('신청자가 없어요', { exact: true }).waitFor();
    await capture(h.page, 'host-applicants', width);
    await h.context.close();
    const m = await contextFor(data.member, width);
    await m.page.goto(`http://127.0.0.1:3013/matches/${data.completed}`);
    await m.page.getByRole('button', { name: '채팅', exact: true }).filter({ visible: true }).waitFor();
    if (stage === 'after') await m.page.getByRole('link', { name: '후기 남기기' }).filter({ visible: true }).waitFor();
    await capture(m.page, 'member-completed', width);
    await m.page.goto(`http://127.0.0.1:3013/matches/${data.upcoming}`);
    await m.page.getByRole('button', { name: '채팅', exact: true }).filter({ visible: true }).waitFor();
    if (stage === 'after') await m.page.getByRole('button', { name: '참가 취소', exact: true }).filter({ visible: true }).waitFor();
    await capture(m.page, 'member-withdraw', width);
    if (stage === 'after') {
      await m.page.getByRole('button', { name: '참가 취소', exact: true }).filter({ visible: true }).scrollIntoViewIfNeeded();
      await capture(m.page, 'member-withdraw-action', width, false);
    }
    await m.page.goto('http://127.0.0.1:3013/my/matches/joined');
    await m.page.getByText('참여한 매치', { exact: true }).first().waitFor();
    if (stage === 'after') {
      const more = m.page.getByRole('button', { name: '더 보기', exact: true });
      await more.click();
      await m.page.getByText('함께한 풋살 51회', { exact: true }).waitFor();
      report.actions.push({ action: 'history-page-2', width, pass: true });
    }
    await m.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await capture(m.page, 'history', width, false);
    await m.context.close();
  }
  if (stage === 'after') {
    const h = await contextFor(data.host, 390);
    await h.page.goto(`http://127.0.0.1:3013/matches/${data.ended}`);
    await h.page.getByRole('button', { name: '경기 완료', exact: true }).filter({ visible: true }).click();
    await h.page.getByRole('dialog').getByRole('button', { name: '경기 완료', exact: true }).click();
    await h.page.getByRole('link', { name: '후기 남기기' }).filter({ visible: true }).waitFor();
    assert.equal(await db.v1MatchParticipant.count({ where: { matchId: data.ended, status: 'completed' } }), 2);
    report.actions.push({ action: 'host-complete-persisted', pass: true });
    await h.page.getByRole('button', { name: '채팅', exact: true }).filter({ visible: true }).click();
    await h.page.waitForURL('**/chat/**');
    report.actions.push({ action: 'host-chat-navigation', pass: true });
    await h.context.close();
    const m = await contextFor(data.member, 390);
    await m.page.goto(`http://127.0.0.1:3013/matches/${data.upcoming}`);
    await m.page.getByRole('button', { name: '참가 취소', exact: true }).filter({ visible: true }).click();
    await m.page.getByRole('dialog').getByRole('button', { name: '참가 취소', exact: true }).click();
    await m.page.getByRole('button', { name: /다시 신청|참가 신청/ }).filter({ visible: true }).waitFor();
    assert.equal((await db.v1MatchParticipant.findUniqueOrThrow({ where: { matchId_userId: { matchId: data.upcoming, userId: data.member } } })).status, 'cancelled');
    report.actions.push({ action: 'member-withdraw-persisted', pass: true });
    await m.page.goto(`http://127.0.0.1:3013/matches/${data.completed}`);
    await m.page.getByRole('link', { name: '후기 남기기' }).filter({ visible: true }).click();
    await m.page.waitForURL(`**/my/reviews/match/${data.completed}`);
    report.actions.push({ action: 'review-navigation', pass: true });
    await m.context.close();
  }
  assert.equal(report.consoleErrors.length, 0, JSON.stringify(report.consoleErrors));
  assert.equal(report.networkErrors.length, 0, JSON.stringify(report.networkErrors));
} finally {
  await writeFile(path.join(output, `${stage}-report.json`), JSON.stringify(report, null, 2));
  await browser.close();
  await db.$disconnect();
}
console.log(JSON.stringify({ screenshots: report.screenshots.length, actions: report.actions, errors: report.networkErrors }));
