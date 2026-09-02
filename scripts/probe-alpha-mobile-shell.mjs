/**
 * [모바일 셸 잘림 프로브] alpha 에서 하단 탭바·스크롤 영역이 뷰포트에 맞게 놓이는지 **숫자로** 잰다.
 *
 * 이 앱은 `body` 가 overflow:hidden 이고 `main.tm-scroll-area` 가 진짜 스크롤러다(메모리
 * v1-web-scrolls-in-a-custom-container). 그래서 window 기준 측정은 쓰지 않고, 프레임·탭바·
 * 스크롤러의 getBoundingClientRect 와 scrollHeight/clientHeight 로 판정한다.
 *
 * 판정 항목(페이지·브라우저·뷰포트마다):
 *  - frameBottomGap  : innerHeight - frame.bottom   (0 이어야 한다. 음수 = 프레임이 뷰포트 밖)
 *  - navBottomGap    : innerHeight - nav.bottom     (0 이어야 한다. 음수 = 탭바 잘림)
 *  - navTopVsScroll  : nav.top - scroll.bottom      (0 이어야 한다. 음수 = 탭바가 콘텐츠를 덮음)
 *  - reachEnd        : 끝까지 스크롤 후 마지막 콘텐츠 bottom - scroll.bottom (양수 = 끝에 못 닿음)
 *  - fixedOverflow   : position:fixed 요소 중 bottom > innerHeight 인 것
 *
 * 사용: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/probe-alpha-mobile-shell.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit, devices } from 'playwright';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? '.screenshots/mobile-shell-probe';
const PAGES = (process.env.PAGES ?? '/home,/tournaments,/teams,/my,/notifications,/search,/chat').split(',');

const TARGETS = [
  { key: 'iphone14-webkit', engine: webkit, device: devices['iPhone 14'] },
  { key: 'pixel7-chromium', engine: chromium, device: devices['Pixel 7'] },
  // 주소창이 펼쳐진 상태를 흉내 낸다(같은 폭, 더 낮은 높이).
  { key: 'iphone14-webkit-short', engine: webkit, device: { ...devices['iPhone 14'], viewport: { width: 390, height: 664 } } },
];

async function login() {
  const preset = process.env.ALPHA_SESSION_TOKEN;
  if (preset) return preset;
  const email = process.env.ALPHA_EMAIL;
  const password = process.env.ALPHA_PASSWORD;
  if (!email || !password) throw new Error('ALPHA_SESSION_TOKEN 또는 ALPHA_EMAIL/ALPHA_PASSWORD 가 필요합니다');
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

const MEASURE = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  };
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) }; };
  const frame = document.querySelector('.tm-app-frame');
  const nav = [...document.querySelectorAll('.tm-bottom-nav')].find(seen) ?? null;
  const scroll = document.querySelector('.tm-scroll-area');
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const innerHeight = window.innerHeight;
  const vv = window.visualViewport;
  const fixed = [...document.querySelectorAll('body *')].filter((el) => {
    const p = getComputedStyle(el).position;
    return (p === 'fixed' || p === 'sticky') && seen(el);
  }).map((el) => ({ sel: el.className?.toString().split(' ').slice(0, 2).join('.'), r: rect(el) }));
  const scrollInfo = scroll ? { scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, overflowY: getComputedStyle(scroll).overflowY, position: getComputedStyle(scroll).position } : null;
  // 끝까지 스크롤한 뒤 마지막 콘텐츠 bottom 과 스크롤러 bottom 의 차이.
  // overflow-y:hidden 은 scrollTop 주입으로는 내려가지만 사용자는 못 내린다 — 그 경우를
  // "닿는다"로 세면 채팅방 입력창 잘림(#970)을 놓친다. 사용자가 스크롤할 수 있는 값에서만 잰다.
  let reachEnd = null;
  if (scroll && (scrollInfo.overflowY === 'auto' || scrollInfo.overflowY === 'scroll')) {
    scroll.scrollTop = scroll.scrollHeight;
    const kids = [...scroll.querySelectorAll('*')].filter(seen);
    const maxBottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom), 0);
    reachEnd = Math.round(maxBottom - scroll.getBoundingClientRect().bottom);
    scroll.scrollTop = 0;
  }
  return {
    innerHeight, innerWidth: window.innerWidth,
    vvHeight: vv ? Math.round(vv.height) : null,
    docScrollHeight: root.scrollHeight,
    varVvh: cs.getPropertyValue('--teameet-visual-viewport-height').trim(),
    safeBottom: cs.getPropertyValue('--v1-shell-safe-bottom').trim(),
    bodyOverflow: getComputedStyle(document.body).overflow,
    frame: rect(frame), frameHeightCss: frame ? getComputedStyle(frame).height : null,
    nav: rect(nav), navPadBottom: nav ? getComputedStyle(nav).paddingBottom : null,
    scroll: rect(scroll), scrollInfo,
    frameBottomGap: frame ? innerHeight - Math.round(frame.getBoundingClientRect().bottom) : null,
    navBottomGap: nav ? innerHeight - Math.round(nav.getBoundingClientRect().bottom) : null,
    navTopVsScroll: nav && scroll ? Math.round(nav.getBoundingClientRect().top - scroll.getBoundingClientRect().bottom) : null,
    reachEnd,
    fixed,
    url: location.pathname,
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const token = await login();
  const results = [];
  for (const target of TARGETS) {
    const browser = await target.engine.launch();
    const context = await browser.newContext({ ...target.device, locale: 'ko-KR', colorScheme: 'light' });
    await context.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/', secure: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    for (const path of PAGES) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const status = res?.status();
      const m = await page.evaluate(MEASURE);
      const row = { target: target.key, path, status, ...m };
      results.push(row);
      const flags = [];
      if (row.frameBottomGap !== 0) flags.push(`frameGap=${row.frameBottomGap}`);
      if (row.navBottomGap !== null && row.navBottomGap !== 0) flags.push(`navGap=${row.navBottomGap}`);
      if (row.navTopVsScroll !== null && row.navTopVsScroll !== 0) flags.push(`navOverlap=${row.navTopVsScroll}`);
      if (row.reachEnd !== null && row.reachEnd > 0) flags.push(`reachEnd=+${row.reachEnd}`);
      if (row.scrollInfo && row.scrollInfo.overflowY === 'hidden' && row.scrollInfo.scrollHeight > row.scrollInfo.clientHeight + 1) flags.push(`scrollerHiddenButOverflows=${row.scrollInfo.scrollHeight - row.scrollInfo.clientHeight}`);
      for (const f of row.fixed) if (f.r && f.r.bottom > row.innerHeight) flags.push(`fixedOverflow:${f.sel}(${f.r.bottom}>${row.innerHeight})`);
      console.log(`${target.key} ${path} [${status}] inner=${row.innerHeight} vv=${row.vvHeight} var=${row.varVvh} frame=${row.frame?.height} nav=${row.nav?.top}-${row.nav?.bottom} scroll=${row.scroll?.top}-${row.scroll?.bottom} sh=${row.scrollInfo?.scrollHeight}/${row.scrollInfo?.clientHeight} ${flags.length ? '⚠ ' + flags.join(' ') : 'ok'}`);
      await page.screenshot({ path: `${OUT}/${target.key}${path.replace(/\//g, '_')}.png` });
    }
    await browser.close();
  }
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
