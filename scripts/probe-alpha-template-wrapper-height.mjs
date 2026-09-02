/**
 * [원인 특정 프로브] template.tsx 래퍼(.tm-page-transition-enter, display:block, height:auto)가
 * `.tm-scroll-area` 와 페이지 사이에 끼면서 `height:100%` 에 기대던 레이아웃이 깨지는지 잰다.
 *
 * 앞선 프로브(probe-alpha-mobile-shell.mjs)는 overflow:hidden 인 스크롤러에 scrollTop 을 직접
 * 넣어 "끝에 닿는다"고 판정했다 — 사용자는 그렇게 스크롤할 수 없다. 여기서는
 *  - chat   : 입력창(.tm-chat-inputbar) 의 bottom 이 뷰포트 안인가 / 스레드가 스크롤러인가
 *  - cta    : .tm-fixed-cta 가 있으면, 스크롤 끝에서 마지막 콘텐츠가 CTA 위로 드러나는가
 *  - wrapper: 래퍼 높이 vs 스크롤 영역 clientHeight, 스크롤러의 overflow-y
 * 를 본다.
 *
 * 사용: ALPHA_PASSWORD=... node scripts/probe-alpha-template-wrapper-height.mjs
 *   (계정은 아래 CASES 의 email — 비밀번호는 전 계정 공통, 저장소에 적지 않는다)
 */
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? '.screenshots/template-wrapper-probe';
const PASSWORD = process.env.ALPHA_PASSWORD;

// email → 그 계정에서 CTA/입력창이 실제로 뜨는 페이지
const CASES = [
  { email: 'alpha.e2e.staff@teameet.test', pages: ['/teams/ea0e4cf0-34ab-411c-ac89-5b931f25e781'] }, // 비멤버 → 가입 CTA
  { email: 'alpha.e2e.captain.a@teameet.test', pages: ['/tournaments', '/teams/00620e9d-b432-4a59-98ef-68afcac31c8b', '/team-matches', '/matches'] },
  { email: 'alpha.e2e.player01@teameet.test', pages: ['/chat/2ebece34-834f-43e0-adfc-7fc84d9d448c', '/matches/c510e9dd-f9e6-4b82-aa73-bf6ca41282ef', '/team-matches/9d3a1eeb-f92e-41b3-933b-2fce92dbb92f'] },
];

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const hit = (res.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 ${email} HTTP ${res.status}`);
  return hit[1];
}

const MEASURE = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  const seen = (el) => { const b = el.getBoundingClientRect(); const c = getComputedStyle(el); return b.width > 0 && b.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
  const scroll = document.querySelector('.tm-scroll-area');
  const wrap = document.querySelector('.tm-page-transition-enter');
  const cta = [...document.querySelectorAll('.tm-fixed-cta')].find(seen) ?? null;
  const inputbar = document.querySelector('.tm-chat-inputbar');
  const thread = document.querySelector('.tm-chat-thread');
  const out = {
    path: location.pathname, innerHeight: innerHeight,
    scroll: r(scroll), scrollOverflowY: scroll ? getComputedStyle(scroll).overflowY : null,
    scrollSH: scroll?.scrollHeight, scrollCH: scroll?.clientHeight,
    wrapper: r(wrap), wrapperDisplay: wrap ? getComputedStyle(wrap).display : null,
    wrapperParent: wrap?.parentElement?.className?.toString().split(' ')[0],
    cta: r(cta), inputbar: r(inputbar),
    thread: thread ? { ...r(thread), overflowY: getComputedStyle(thread).overflowY, sh: thread.scrollHeight, ch: thread.clientHeight } : null,
  };
  // 사용자가 할 수 있는 스크롤(휠/터치)만 가정: overflow-y hidden 이면 못 내린다.
  if (scroll && out.scrollOverflowY === 'auto') {
    scroll.scrollTop = scroll.scrollHeight;
    const kids = [...(wrap ?? scroll).querySelectorAll('*')].filter((k) => seen(k) && getComputedStyle(k).position !== 'fixed');
    const lastBottom = Math.max(0, ...kids.map((k) => k.getBoundingClientRect().bottom));
    out.atEnd = { lastContentBottom: Math.round(lastBottom), ctaTop: cta ? Math.round(cta.getBoundingClientRect().top) : null, scrollBottom: Math.round(scroll.getBoundingClientRect().bottom) };
    out.hiddenBehindCta = cta ? Math.max(0, Math.round(lastBottom - cta.getBoundingClientRect().top)) : 0;
    scroll.scrollTop = 0;
  }
  return out;
})()`;

mkdirSync(OUT, { recursive: true });
for (const [engineName, engine, device] of [['pixel7', chromium, devices['Pixel 7']], ['iphone14', webkit, devices['iPhone 14']]]) {
  for (const c of CASES) {
    const token = await login(c.email);
    const browser = await engine.launch();
    const ctx = await browser.newContext({ ...device, locale: 'ko-KR' });
    await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/', secure: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    for (const path of c.pages) {
      const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const m = await page.evaluate(MEASURE);
      const flags = [];
      if (m.inputbar && m.inputbar.bottom > m.innerHeight) flags.push(`INPUTBAR_BELOW_VIEWPORT(+${m.inputbar.bottom - m.innerHeight})`);
      if (m.thread && m.thread.sh > m.thread.ch + 1 && m.thread.overflowY === 'auto' && m.thread.bottom > m.innerHeight) flags.push('THREAD_OVERFLOWS_VIEWPORT');
      if (m.hiddenBehindCta > 0) flags.push(`HIDDEN_BEHIND_CTA(${m.hiddenBehindCta})`);
      if (m.scrollOverflowY === 'hidden' && m.scrollSH > m.scrollCH + 1) flags.push(`SCROLLER_HIDDEN_BUT_OVERFLOWS(${m.scrollSH - m.scrollCH})`);
      console.log(`${engineName} ${c.email.split('@')[0].replace('alpha.e2e.', '')} ${path} [${res?.status()}] inner=${m.innerHeight} scroll=${m.scroll?.top}-${m.scroll?.bottom}/${m.scrollOverflowY} wrap=${m.wrapper?.h}(${m.wrapperDisplay}) cta=${m.cta ? m.cta.top + '-' + m.cta.bottom : '-'} inputbar=${m.inputbar ? m.inputbar.top + '-' + m.inputbar.bottom : '-'} thread=${m.thread ? m.thread.sh + '/' + m.thread.ch + '/' + m.thread.overflowY : '-'} atEnd=${m.atEnd ? JSON.stringify(m.atEnd) : '-'} ${flags.length ? '⚠ ' + flags.join(' ') : 'ok'}`);
      await page.screenshot({ path: `${OUT}/${engineName}${path.replace(/\//g, '_')}.png` });
    }
    await browser.close();
  }
}
