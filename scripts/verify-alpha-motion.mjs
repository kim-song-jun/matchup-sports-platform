#!/usr/bin/env node
/** 모션 변경(#790 탭바 · #801 탭 · #808 시트 · #810 토스트)이 alpha 에 실제로
 *  실렸는지 잰다.
 *
 *  스크린샷으로는 확인되지 않는 종류다 — 움직임은 프레임 **사이**에 있고, 끝난
 *  상태는 변경 전과 픽셀 단위로 같다. 그래서 computed 값을 직접 읽는다.
 *
 *  대상 중 일부는 로그인 뒤 화면이라 요소를 직접 못 연다. 그런 것은 **같은
 *  클래스를 실제 페이지에 심어** 재는데, 진짜 번들 CSS 위에서 재므로 규칙이
 *  실렸는지·토큰이 어떤 값으로 풀리는지는 그대로 확인된다.
 *
 *  공개 경로만 쓰므로 자격증명이 필요 없다.
 */
import { chromium } from 'playwright';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';

const browser = await chromium.launch();
const results = [];
// 중간에 던져도 Chromium 을 남기지 않는다 — 하네스가 프로세스를 흘리면
// 반복 실행에서 호스트가 잠식된다.
try {

/** 폭별로 시트 퇴장 애니메이션을 잰다 — 모바일/데스크탑이 서로 다른 축이어야 한다. */
for (const [label, width, wantName] of [
  ['시트 퇴장 · 모바일 390', 390, 'tm-filter-sheet-up'],
  ['시트 퇴장 · 데스크탑 1440', 1440, 'fade-in'],
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const resp = await page.goto(BASE + '/tournaments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const got = await page.evaluate(() => {
    const d = document.createElement('div');
    // is-closing 을 반드시 붙인다. 안 붙이면 진입 규칙(0.18s normal)을 재고
    // 퇴장이라 부르게 된다 — 이 앱에서는 두 값이 우연히 같아 결론이 맞았지만,
    // 값이 갈리는 순간 조용히 틀린 답을 낸다.
    d.className = 'tm-notification-sheet-backdrop is-closing';
    d.innerHTML = '<div class="tm-notification-sheet is-closing">x</div>';
    document.body.appendChild(d);
    const sheet = d.querySelector('.tm-notification-sheet');
    const cs = getComputedStyle(sheet);
    const bs = getComputedStyle(d);
    const r = {
      name: cs.animationName,
      duration: cs.animationDuration,
      direction: cs.animationDirection,
      backdropName: bs.animationName,
      backdropDuration: bs.animationDuration,
      backdropDirection: bs.animationDirection,
    };
    d.remove();
    return r;
  });
  // backdrop 도 함께 판정한다. 값만 찍고 넘어가면 **배경이 시트보다 먼저 걷히는
  // 어긋남**을 놓친다 — 실제로 첫 실행에서 backdrop 0.18s / 시트 0.22s 로 40ms
  // 동안 시트가 배경 없이 떠 있는 상태를 이 스크립트가 지나쳤다.
  // HTTP 상태를 판정에 넣지 않으면 **404/500 을 받고도** got.* 만 맞으면 통과한다.
  // backdropName 도 본다 — duration·direction 만으로는 우연히 같은 값을 가진
  // 다른 애니메이션과 구분되지 않는다.
  const ok =
    (resp?.status() ?? 0) === 200 &&
    got.backdropName === 'tm-filter-scrim-fade' &&
    got.name === wantName &&
    got.duration === '0.22s' &&
    got.direction === 'reverse' &&
    got.backdropDuration === '0.22s' &&
    got.backdropDirection === 'reverse';
  results.push({
    label,
    status: resp?.status() ?? 0,
    ok,
    got,
    want: `${wantName} / 0.22s / reverse · backdrop 0.22s reverse`,
  });
  await page.close();
}

/** 탭 크로스페이드(#801)와 탭바 전환(#790) — 둘 다 공개 번들에 실린다. */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const resp = await page.goto(BASE + '/tournaments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const got = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'tm-tabpanel-enter';
    document.body.appendChild(probe);
    const tab = document.querySelector('.tm-bottom-tab');
    const cs = getComputedStyle(probe);
    const r = {
      tabpanelName: cs.animationName,
      tabpanelDuration: cs.animationDuration,
      // 탭바는 실제 요소가 페이지에 있다
      bottomTabProperty: tab ? getComputedStyle(tab).transitionProperty : '(요소 없음)',
      bottomTabDuration: tab ? getComputedStyle(tab).transitionDuration : '-',
    };
    probe.remove();
    return r;
  });
  results.push({
    label: '탭 크로스페이드(#801)',
    status: resp?.status() ?? 0,
    ok:
      (resp?.status() ?? 0) === 200 &&
      got.tabpanelName === 'tm-tabpanel-in' &&
      got.tabpanelDuration === '0.16s',
    got: { name: got.tabpanelName, duration: got.tabpanelDuration },
    want: 'tm-tabpanel-in / 0.16s',
  });
  results.push({
    label: '하단 탭바 전환(#790)',
    status: resp?.status() ?? 0,
    ok:
      (resp?.status() ?? 0) === 200 &&
      got.bottomTabProperty === 'color' &&
      got.bottomTabDuration === '0.12s',
    got: { property: got.bottomTabProperty, duration: got.bottomTabDuration },
    want: 'color / 0.12s',
  });
  await page.close();
}

/** 토스트 퇴장(#810) — Tailwind 임의값 애니메이션이라 클래스를 심어 확인한다. */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const resp = await page.goto(BASE + '/tournaments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const got = await page.evaluate(() => {
    const mk = (cls) => {
      const d = document.createElement('div');
      d.className = cls;
      document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const r = { name: cs.animationName, direction: cs.animationDirection, duration: cs.animationDuration };
      d.remove();
      return r;
    };
    return {
      enter: mk('motion-safe:animate-[fade-in_0.15s_ease-out]'),
      exit: mk('motion-safe:animate-[fade-in_0.15s_ease-in_reverse_both]'),
    };
  });
  results.push({
    label: '토스트 퇴장(#810)',
    status: resp?.status() ?? 0,
    // 진입은 정방향, 퇴장은 reverse — 방향이 갈리는 것이 이 변경의 핵심이다
    ok:
      (resp?.status() ?? 0) === 200 &&
      got.exit.name === 'fade-in' &&
      got.exit.direction === 'reverse' &&
      got.enter.direction === 'normal',
    got: { 진입: got.enter.direction, 퇴장: got.exit.direction, duration: got.exit.duration },
    want: '진입 normal / 퇴장 reverse',
  });
  await page.close();
}

} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(
    `${r.ok ? '  ✓ ' : '  ★ '}${r.label.padEnd(26)} HTTP ${r.status}  ${JSON.stringify(r.got)}` +
      (r.ok ? '' : `\n      기대: ${r.want}`),
  );
}
console.log(`\n합계: ${results.length - failed}/${results.length} 통과`);
if (failed) process.exit(1);
