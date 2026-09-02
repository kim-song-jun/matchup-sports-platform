/**
 * [#970 갤러리] alpha 채팅방을 📱390 / 📲768 / 🖥1440 로 찍고, 같은 자리에서 입력창 위치를 숫자로 남긴다.
 * 스레드는 끝까지 내린 상태(사용자가 채팅방을 열었을 때의 기본 상태)로 찍는다.
 *
 * 사용: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/capture-alpha-chat-room-shell.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? '.screenshots/pr970-chat-room';
const ROOM = process.env.CHAT_ROOM ?? '/chat/2ebece34-834f-43e0-adfc-7fc84d9d448c';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844, mobile: true },
  { key: 'tablet', width: 768, height: 1024, mobile: true },
  { key: 'desktop', width: 1440, height: 900, mobile: false },
];

async function login() {
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  if (!email || !password) throw new Error('ALPHA_EMAIL/ALPHA_PASSWORD 가 필요합니다');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

mkdirSync(OUT, { recursive: true });
const token = await login();
const browser = await chromium.launch();
const rows = [];
for (const w of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: w.width, height: w.height }, isMobile: w.mobile, hasTouch: w.mobile,
    deviceScaleFactor: 2, locale: 'ko-KR', colorScheme: 'light',
  });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/', secure: new URL(BASE).protocol === 'https:', sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  const res = await page.goto(BASE + ROOM, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const th = q('.tm-chat-thread');
    if (th) th.scrollTop = th.scrollHeight;
    const ib = q('.tm-chat-inputbar');
    const s = q('.tm-scroll-area');
    return {
      innerHeight: innerHeight,
      inputbarBottom: ib ? Math.round(ib.getBoundingClientRect().bottom) : null,
      threadScrollable: th ? th.scrollHeight > th.clientHeight : null,
      scrollOverflowY: s ? getComputedStyle(s).overflowY : null,
    };
  });
  await page.waitForTimeout(300);
  const file = `${OUT}/${w.key}-${w.width}.png`;
  await page.screenshot({ path: file });
  rows.push({ ...w, status: res?.status(), ...m, file });
  console.log(`${w.key} ${w.width} [${res?.status()}] inner=${m.innerHeight} inputbarBottom=${m.inputbarBottom} threadScrollable=${m.threadScrollable} scroller=${m.scrollOverflowY} ${m.inputbarBottom !== null && m.inputbarBottom <= m.innerHeight ? 'ok' : '⚠ INPUTBAR_OUT'}`);
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(rows, null, 2));
