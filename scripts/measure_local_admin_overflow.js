// 어드민 화면의 실제 레이아웃 결함을 눈이 아니라 수치로 잡는다.
// - 가로 넘침(요소가 컨테이너 밖으로 나가는지)
// - 사이드바가 뷰포트 높이를 넘는지
// - 터치 타겟 44px 미만
// Run: WEB=... ADMIN_ID=... ADMIN_EMAIL=... node scripts/measure_local_admin_overflow.js
const { chromium } = require('@playwright/test');

const WEB = process.env.WEB || 'http://localhost:3013';
const ADMIN_ID = (process.env.ADMIN_ID || '').trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();
const ROUTES = (process.env.ROUTES || '/admin,/admin/users,/admin/terms,/admin/notices,/admin/popups').split(',');
const WIDTHS = [390, 768, 1440];

(async () => {
  const browser = await chromium.launch();
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addInitScript(
      ([id, email]) => {
        localStorage.setItem('teameet.v1.userId', id);
        localStorage.setItem('teameet.v1.userEmail', email);
      },
      [ADMIN_ID, ADMIN_EMAIL],
    );
    const page = await ctx.newPage();
    console.log(`\n══ ${width}px ══`);
    for (const route of ROUTES) {
      await page.goto(`${WEB}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('nav[aria-label="주 메뉴"]', { state: 'attached', timeout: 60000 }).catch(() => {});
      await page
        .waitForFunction(() => {
          const m = document.querySelector('main');
          return m && !m.querySelector('.animate-pulse') && (m.innerText ?? '').trim().length > 20;
        }, { timeout: 30000 })
        .catch(() => {});
      await page.waitForTimeout(400);

      const r = await page.evaluate(() => {
        const out = { bodyOverflow: 0, clipped: [], smallTargets: 0, sidebarOverflow: null };
        // 1) 문서 가로 스크롤
        out.bodyOverflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
        // 2) 정말로 "잘린" 요소만 — 가로 스크롤 컨테이너 안에 있으면 스크롤로 도달 가능하므로
        //    결함이 아니다. 조상에 overflow-x auto/scroll 이 하나라도 있으면 제외한다.
        //    (이 제외를 안 하면 넓은 테이블의 우측 컬럼이 전부 오탐으로 잡힌다 — 실제로 겪음)
        const inScrollContainer = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
          }
          return false;
        };
        const main = document.querySelector('main');
        if (main) {
          const mr = main.getBoundingClientRect();
          for (const el of main.querySelectorAll('button, a, td, th')) {
            const b = el.getBoundingClientRect();
            if (b.width === 0) continue;
            if (b.right - mr.right > 4 && !inScrollContainer(el)) {
              out.clipped.push(`${el.tagName}:${(el.innerText || '').trim().slice(0, 12)} +${Math.round(b.right - mr.right)}px`);
            }
          }
          // 3) 44px 미만 인터랙티브 — 무엇인지 알아야 "고칠 것"과 "본문 속 인라인 링크"를
          //    구분할 수 있으므로 라벨과 크기를 함께 남긴다.
          out.smallList = [];
          for (const el of main.querySelectorAll('button, a[href]')) {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && b.height > 0 && b.height < 44) {
              out.smallTargets += 1;
              out.smallList.push(
                `${el.tagName}"${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 14)}" ${Math.round(b.width)}×${Math.round(b.height)}`,
              );
            }
          }
        }
        // 4) 사이드바가 화면 높이를 넘는지
        const nav = document.querySelector('nav[aria-label="주 메뉴"]');
        if (nav) {
          const aside = nav.closest('aside') || nav.parentElement;
          if (aside) {
            out.sidebarOverflow = Math.max(0, nav.scrollHeight - aside.clientHeight);
          }
        }
        return out;
      });

      const flags = [];
      if (r.bodyOverflow > 0) flags.push(`가로스크롤 +${r.bodyOverflow}px`);
      if (r.clipped.length) flags.push(`컨테이너 밖 ${r.clipped.length}개 [${r.clipped.slice(0, 2).join(' / ')}]`);
      if (r.smallTargets) flags.push(`44px미만 ${r.smallTargets}개`);
      if (r.sidebarOverflow) flags.push(`사이드바 넘침 +${r.sidebarOverflow}px`);
      console.log(`  ${route.padEnd(24)} ${flags.length ? flags.join(' · ') : '이상 없음'}`);
      if (process.env.VERBOSE && r.smallList?.length) {
        const uniq = [...new Set(r.smallList)];
        console.log(`      └ ${uniq.slice(0, 6).join(' | ')}${uniq.length > 6 ? ` … +${uniq.length - 6}종` : ''}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
