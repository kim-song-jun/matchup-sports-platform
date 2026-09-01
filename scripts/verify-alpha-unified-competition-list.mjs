/**
 * [PR-B 판정] 통합 대회 목록(`?kind=`)과 리그 상세를 alpha 실화면에서 잰다.
 *
 * ## 왜 curl 로는 안 되는가 — 이걸 먼저 확인하고 만들었다
 * `/tournaments/:id` 를 curl 로 받으면 **셸만 온다**(보이는 텍스트 266자: 헤더·푸터뿐).
 * 본문은 클라이언트에서 그려진다. 그래서 HTML 문자열 검사로 *"정원 문구가 없다"* 를 확인하면
 * **콘텐츠가 없어서 없는 것**을 통과로 읽는다 — vacuous 다. 그래서 브라우저로 렌더한다.
 *
 * 그 함정을 스크립트가 스스로 막도록, 모든 부재 판정에 **양성 짝**을 붙였다:
 * 리그 상세라면 "팀 참가"·"통합 순위" 가 **있어야** 하고, 그게 없으면 부재 판정을
 * `INCONCLUSIVE` 로 표시한다(통과로 세지 않는다).
 *
 * ## ⚠️ 읽기만 한다
 * `goto` · `evaluate`(읽기) · `screenshot` 만. 클릭·입력·제출·mutation 없음.
 * 이 성질은 `test/config/alpha-probe-readonly.contract.spec.ts` 가 게이트로 지킨다.
 *
 * ## 캡처 주의
 * - `networkidle` 을 쓰지 않는다 — 리그가 있는 화면은 10초 폴링이라 **끝나지 않는다**.
 * - v1_web 은 window 로 스크롤하지 않는다(`.tm-scroll-area` 가 실제 스크롤러) — 좌표는
 *   `getBoundingClientRect` 로 뷰포트 기준으로만 읽는다.
 * - alpha 는 과한 캡처에 403 을 준다 — 매 goto 의 httpStatus 를 기록한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? 'output/pr-b-verify';
const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

const results = [];
const record = (id, verdict, detail) => {
  results.push({ id, verdict, detail });
  const mark = verdict === 'PASS' ? '✅' : verdict === 'FAIL' ? '❌' : '⚠️ ';
  console.log(`${mark} ${id}: ${detail}`);
};

async function firstLeagueId() {
  const res = await fetch(`${API}/tournaments?limit=5&kind=league`);
  const body = await res.json();
  return body?.data?.items?.[0]?.id ?? null;
}

/** 세로 좌표를 뷰포트 기준으로 읽는다. 없으면 null (0 으로 메우지 않는다 — 0 은 "맨 위" 로 읽힌다). */
const topOf = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  return el ? Math.round(el.getBoundingClientRect().top) : null;
})()`;

/**
 * `/tournaments` 상단 스택을 요소별로 잰다 — **"세그먼트가 몇 px 을 더했나"** 에 직접 답한다.
 *
 * 첫 카드 top 을 이전 값과 비교하는 방식은 **두 측정의 조건이 같은지 알 수 없다**(프로모
 * 캐러셀이 이미지 로딩 전이면 그만큼 짧게 나온다). 그래서 비교 대신 **지금 화면에서
 * 각 요소가 차지한 높이**를 읽는다 — 세그먼트 몫이 얼마인지가 그 자리에서 보인다.
 */
async function measureTopStack(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/tournaments`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const stack = await page.evaluate(`(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), height: Math.round(r.height) };
    };
    const byText = (t) => [...document.querySelectorAll('*')].find((e) => e.textContent?.trim() === t);
    const firstCard = document.querySelector('[role="list"][aria-label="대회 목록"] > *');
    const seg = document.querySelector('nav[aria-label="대회 유형"]');
    const segStyle = seg ? getComputedStyle(seg) : null;
    return {
      promoCarousel: box(document.querySelector('[class*="promo"], [class*="carousel"]')),
      eventBanner: box(document.querySelector('[aria-label*="이벤트 허브"]')),
      sectionTitle: box(byText('대회 목록')),
      segment: box(seg),
      segmentMargin: segStyle ? { top: segStyle.marginTop, bottom: segStyle.marginBottom } : null,
      sportChips: box(document.querySelector('[role="group"][aria-label="종목 필터"]')),
      firstCard: box(firstCard),
      images: document.images.length,
      imagesComplete: [...document.images].filter((i) => i.complete).length,
    };
  })()`);
  await ctx.close();
  return { status: res?.status(), stack };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  if (process.env.PROBE_TOP_STACK) {
    const browser = await chromium.launch();
    try {
      const { status, stack } = await measureTopStack(browser);
      console.log(`/tournaments 390폭 상단 스택 (status ${status})`);
      for (const [k, v] of Object.entries(stack)) {
        if (v && typeof v === 'object' && 'top' in v) {
          console.log(`  ${k.padEnd(15)} top=${String(v.top).padStart(4)}  height=${String(v.height).padStart(4)}`);
        } else {
          console.log(`  ${k.padEnd(15)} ${JSON.stringify(v)}`);
        }
      }
      const seg = stack.segment;
      if (seg) {
        const m = stack.segmentMargin;
        console.log(`\n  → 세그먼트가 더한 세로 = height ${seg.height} + margin(${m?.top} / ${m?.bottom})`);
      }
    } finally {
      await browser.close();
    }
    return;
  }

  const leagueId = await firstLeagueId();
  if (!leagueId) {
    record('setup', 'INCONCLUSIVE', '리그를 하나도 못 받았다 — 판정 불가');
    return;
  }
  console.log(`리그 id: ${leagueId}\n`);

  const browser = await chromium.launch();
  try {
    for (const vp of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();

      // ── /tournaments (쿼리 없음 = 전체) ──
      const listRes = await page.goto(`${BASE}/tournaments`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      const listStatus = listRes?.status();
      await page.screenshot({ path: `${OUT}/tournaments-${vp.key}.png`, fullPage: false });

      const list = await page.evaluate(`(() => {
        const cards = [...document.querySelectorAll('[role="list"][aria-label="대회 목록"] > *')];
        const badges = [...document.querySelectorAll('[aria-label="정규 리그"]')];
        const seg = document.querySelector('nav[aria-label="대회 유형"]');
        const title = [...document.querySelectorAll('*')].find((e) => e.textContent?.trim() === '대회 목록');
        const chips = document.querySelector('[role="group"][aria-label="종목 필터"]');
        const rect = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null);
        return {
          cardCount: cards.length,
          leagueBadges: badges.length,
          firstCardTop: cards[0] ? Math.round(cards[0].getBoundingClientRect().top) : null,
          segLeft: rect(seg),
          titleLeft: rect(title),
          chipsLeft: rect(chips),
          segTop: seg ? Math.round(seg.getBoundingClientRect().top) : null,
        };
      })()`);

      if (vp.key === 'mobile') {
        // 판정 2 — 전체 탭에 두 종류가 섞이는가
        if (list.cardCount === 0) {
          record('2-섞임', 'INCONCLUSIVE', `카드가 0개다 (status ${listStatus}) — 부재를 통과로 읽지 않는다`);
        } else {
          const mixed = list.leagueBadges > 0 && list.leagueBadges < list.cardCount;
          record(
            '2-섞임',
            mixed ? 'PASS' : 'FAIL',
            `첫 화면 카드 ${list.cardCount}개 중 리그 배지 ${list.leagueBadges}개` +
              (mixed ? '' : list.leagueBadges === list.cardCount ? ' — 전부 리그다(대회가 안 보인다)' : ' — 리그가 없다'),
          );
        }
      }

      if (vp.key === 'desktop') {
        // 판정 4 — 세그먼트 좌측 선이 제목·칩과 맞는가
        const { segLeft, titleLeft, chipsLeft } = list;
        if (segLeft === null || titleLeft === null || chipsLeft === null) {
          record('4-정렬', 'INCONCLUSIVE', `요소를 못 찾았다 seg=${segLeft} title=${titleLeft} chips=${chipsLeft}`);
        } else {
          const maxGap = Math.max(Math.abs(segLeft - titleLeft), Math.abs(segLeft - chipsLeft));
          record(
            '4-정렬',
            maxGap <= 1 ? 'PASS' : 'FAIL',
            `1440 좌측 x — 세그먼트 ${segLeft} · 제목 ${titleLeft} · 칩 ${chipsLeft} (최대차 ${maxGap}px)`,
          );
        }
      }

      // ── 리그 상세 ──
      const detRes = await page.goto(`${BASE}/tournaments/${leagueId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const detStatus = detRes?.status();
      await page.screenshot({ path: `${OUT}/league-detail-${vp.key}.png`, fullPage: false });

      const det = await page.evaluate(`(() => {
        const text = document.body.innerText;
        return {
          len: text.length,
          hasTeamJoin: text.includes('팀 참가'),
          hasStandings: text.includes('통합 순위'),
          hasSeats: text.includes('자리 남았어요'),
          hasConfirmed: text.includes('팀 확정'),
          hasGender: text.includes('성별 구분 없음'),
          /* '참가비' 로 잡으면 거짓 FAIL 이 난다 — "참가 전 꼭 확인해 주세요" 체크리스트가
             "운영진 확인 + 참가비 입금 완료 후…" 처럼 그 단어를 4번 쓴다(실측).
             우리가 막은 것은 InfoRow 의 참가비 값이고, entryFee 0 의 표시값은 "무료" 다.
             (이 주석은 템플릿 리터럴 안이라 백틱을 쓸 수 없다 — 쓰면 evaluate 인자가 깨진다.) */
          hasFee: text.includes('무료'),
          capacityBars: [...document.querySelectorAll('[role="progressbar"]')]
            .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('정원')).length,
        };
      })()`);

      if (vp.key === 'mobile') {
        const rendered = det.hasTeamJoin || det.hasStandings;
        if (!rendered) {
          record('3-리그상세', 'INCONCLUSIVE',
            `본문이 안 그려졌다 (status ${detStatus}, text ${det.len}자) — 부재를 통과로 읽지 않는다`);
        } else {
          const leaks = [
            det.hasSeats && '자리 남았어요',
            det.hasConfirmed && '팀 확정',
            det.hasGender && '성별 구분 없음',
            det.hasFee && '참가비 무료',
            det.capacityBars > 0 && `정원 진행바 ${det.capacityBars}개`,
          ].filter(Boolean);
          record('3-리그상세', leaks.length === 0 ? 'PASS' : 'FAIL',
            leaks.length === 0
              ? `본문 렌더 확인(팀참가=${det.hasTeamJoin} 순위=${det.hasStandings}) · 정원·참가비·성별 전부 없음`
              : `새는 것: ${leaks.join(' / ')}`);
        }
      }

      // ── /league-matches (판정 1 비교 대상) ──
      const lmRes = await page.goto(`${BASE}/league-matches`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      const lmStatus = lmRes?.status();
      await page.screenshot({ path: `${OUT}/league-matches-${vp.key}.png`, fullPage: false });
      const lmTop = await page.evaluate(topOf('[role="list"][aria-label="리그 목록"] > *'));

      if (vp.key === 'mobile') {
        if (list.firstCardTop === null || lmTop === null) {
          record('1-첫카드', 'INCONCLUSIVE',
            `좌표를 못 읽었다 tournaments=${list.firstCardTop} league-matches=${lmTop} (status ${listStatus}/${lmStatus})`);
        } else {
          const diff = Math.abs(list.firstCardTop - lmTop);
          record('1-첫카드', diff <= 100 ? 'PASS' : 'FAIL',
            `첫 카드 top — /tournaments ${list.firstCardTop}px · /league-matches ${lmTop}px (차 ${diff}px, 기준 ≤100)`);
        }
      }

      console.log(`  [${vp.key}] status list=${listStatus} detail=${detStatus} league=${lmStatus}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  writeFileSync(`${OUT}/verdicts.json`, JSON.stringify(results, null, 2));
  const fails = results.filter((r) => r.verdict !== 'PASS');
  console.log(`\n판정 ${results.length}건 — PASS ${results.length - fails.length} / 그 외 ${fails.length}`);
  console.log(`스크린샷: ${OUT}`);
}

main().catch((err) => {
  console.error('실패:', err.message);
  process.exit(1);
});
