// alpha 실측: 스태프 화면(운영 보드 · 운영 콘솔 · 결과 검수)의 승부차기 결과 노출 여부
//
// 사용법:
//   ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify_alpha_staff_penalty_visibility.mjs
//
// 자격증명은 인자로만 받는다(레포는 public — 하드코딩 금지).
// 대상 경기는 alpha 공개 API 에서 penalties 가 실제로 있는 것으로 확인된 픽스처다.
//
// "보인다/안 보인다"를 눈으로 판단하지 않고, DOM 텍스트에서 실제 값을 찾아 보고한다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
const LABEL = process.env.LABEL || 'before';
const OUT = process.env.OUT_DIR || `/private/tmp/alpha-staff-penalty/${LABEL}`;

if (!EMAIL || !PASSWORD) {
  console.error('ALPHA_EMAIL / ALPHA_PASSWORD 환경변수가 필요해요.');
  process.exit(1);
}

// 승부차기가 실제로 기록된 경기 (공개 API 로 확인: 정규 0:0 · 승부차기 2:0)
const TID = process.env.TID || 'aa100000-0000-4000-8000-000000000004';
const FID = process.env.FID || '14672086-50fe-4aa2-b594-b47ba44b05fc';

mkdirSync(OUT, { recursive: true });

async function sessionCookie() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const hit = raw.filter(Boolean).find((c) => c.startsWith('teameet_v1_session='));
  if (!hit) throw new Error('teameet_v1_session 쿠키를 받지 못했어요.');
  return hit.split(';')[0].slice('teameet_v1_session='.length);
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}

/** 화면 전체 텍스트에서 승부차기 표기와 스코어 후보를 뽑는다(육안 판단 금지). */
async function probe(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const penaltyLines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /승부차기|PK\s*\d/.test(line));
    return {
      hasPenaltyText: penaltyLines.length > 0,
      penaltyLines: penaltyLines.slice(0, 8),
      scoreLike: (text.match(/\b\d+\s*:\s*\d+\b/g) || []).slice(0, 8),
      bodySample: text.slice(0, 240).replace(/\n+/g, ' | '),
    };
  });
}

const token = await sessionCookie();
const browser = await chromium.launch({ headless: true });
const report = {};

try {
  for (const [width, tag] of [[390, 'mobile'], [1440, 'desktop']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addCookies([
      { name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    ]);
    const page = await ctx.newPage();

    const screens = [
      ['operations-board', `${BASE}/tournament-ops/tournaments/${TID}/operations`],
      ['operate-console', `${BASE}/tournament-ops/tournaments/${TID}/fixtures/${FID}/operate`],
      ['result-review', `${BASE}/tournament-ops/tournaments/${TID}/result-review`],
    ];

    for (const [name, url] of screens) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await settle(page);
      const shot = `${OUT}/${name}-${tag}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      report[`${name}-${tag}`] = { url, shot, ...(await probe(page)) };
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
