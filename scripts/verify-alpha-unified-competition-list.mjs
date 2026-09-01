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
/**
 * `goto` 기본 타임아웃은 30s 다. alpha 는 이미지·폴링 때문에 그걸 넘길 때가 있고, 넘으면
 * 하네스가 **예외로 끝난다** — "측정 불가"가 아니라 "실패"로 남는다는 뜻이다(setup 을
 * `INCONCLUSIVE` 로 만든 것과 같은 종류의 구멍). 옆 스크립트 둘이 이미 60s 로 쓰고 있다:
 * `capture-alpha-competition-lists.mjs:105` · `capture-alpha-league-on-tournament-surface.mjs:267`.
 * **상수로 둔다 — 값을 다섯 군데 적으면 한 군데는 빠진다.**
 */
const GOTO = { waitUntil: 'domcontentloaded', timeout: 60_000 };

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

/**
 * 대상 고르기도 **측정 불가와 결함을 가른다.**
 *
 * 예전에는 `res.json()` 을 바로 불렀다 — alpha 가 전면 403 을 걸면(과한 캡처에 실제로 그런
 * 전례가 있다) 비JSON 응답에 예외가 나고, 그러면 하네스가 **"판정 실패"** 로 끝난다. 다음
 * 사람은 그걸 *"화면이 깨졌다"* 로 읽는다. 본체 판정은 `INCONCLUSIVE` 로 떨어지게 해뒀는데
 * **대상을 고르는 단계만 그 밖에 있었다.**
 */
async function pickTarget(kind) {
  let res;
  try {
    res = await fetch(`${API}/tournaments?limit=5&kind=${kind}`);
  } catch (err) {
    return { error: `네트워크 실패: ${err.message}` };
  }
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return { error: `비JSON 응답 (content-type: ${type})` };
  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { error: `JSON 파싱 실패: ${err.message}` };
  }
  const id = body?.data?.items?.[0]?.id ?? null;
  return id ? { id } : { error: `${kind} 항목 0건` };
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
  const res = await page.goto(`${BASE}/tournaments`, GOTO);
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

  const league = await pickTarget('league');
  const tournament = await pickTarget('tournament');
  if (league.error) {
    record('setup', 'INCONCLUSIVE', `리그를 못 골랐다 — ${league.error} · 판정 불가(결함 아님)`);
    return;
  }
  if (tournament.error) {
    record('setup', 'INCONCLUSIVE', `대조군 대회를 못 골랐다 — ${tournament.error} · 판정 불가(결함 아님)`);
    return;
  }
  const leagueId = league.id;
  const tournamentId = tournament.id;
  console.log(`리그 id: ${leagueId}\n대조군 대회 id: ${tournamentId}\n`);

  const browser = await chromium.launch();
  try {
    for (const vp of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();

      // ── /tournaments (쿼리 없음 = 전체) ──
      const listRes = await page.goto(`${BASE}/tournaments`, GOTO);
      await page.waitForTimeout(4000);
      const listStatus = listRes?.status();
      await page.screenshot({ path: `${OUT}/tournaments-${vp.key}.png`, fullPage: false });

      const list = await page.evaluate(`(() => {
        /* '첫 화면' 이라고 말하려면 **뷰포트 안에 걸린 카드**만 세야 한다. 예전에는 DOM 전체를
           세면서 메시지만 "첫 화면" 이라 적었다 — 페이지 크기(20)가 우연히 한 화면처럼 보였을
           뿐이고, 대회가 섞였는데 스크롤 아래에 있으면 **거짓 PASS** 가 난다.
           배지도 document 전체가 아니라 **그 카드 안**에서 센다 — 카드 밖 배지를 세면 짝이 안 맞는다. */
        const inView = (el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        };
        const allCards = [...document.querySelectorAll('[role="list"][aria-label="대회 목록"] > *')];
        const cards = allCards.filter(inView);
        const badges = cards.filter((c) => c.querySelector('[aria-label="정규 리그"]') !== null);
        const seg = document.querySelector('nav[aria-label="대회 유형"]');
        const title = [...document.querySelectorAll('*')].find((e) => e.textContent?.trim() === '대회 목록');
        const chips = document.querySelector('[role="group"][aria-label="종목 필터"]');
        const rect = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null);
        return {
          cardCount: cards.length,
          domCardCount: allCards.length,
          leagueBadges: badges.length,
          firstCardTop: allCards[0] ? Math.round(allCards[0].getBoundingClientRect().top) : null,
          segLeft: rect(seg),
          titleLeft: rect(title),
          chipsLeft: rect(chips),
          segTop: seg ? Math.round(seg.getBoundingClientRect().top) : null,
          segHeight: seg ? Math.round(seg.getBoundingClientRect().height) : null,
          segMarginBottom: seg ? Math.round(parseFloat(getComputedStyle(seg).marginBottom) || 0) : 0,
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
            `첫 화면(뷰포트) 카드 ${list.cardCount}개 중 리그 ${list.leagueBadges}개` +
              ` [DOM 전체 ${list.domCardCount}개]` +
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
      const detRes = await page.goto(`${BASE}/tournaments/${leagueId}`, GOTO);
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
          /* 참가비는 **라벨 노드**로 본다 — 문자열 매칭은 양쪽으로 틀린다.
               '참가비' 포함  → "운영진 확인 + 참가비 입금 완료 후…" 안내 4건에 걸려 거짓 FAIL
               '무료' 포함    → entryFee 가 0 이 아닌 값으로 새면 "N원" 이라 **놓친다**
             InfoRow 는 라벨을 자기 div 에 담으므로(레일은 span), 자식이 없고 텍스트가 정확히
             '참가비' 인 노드를 센다. 값이 무엇이든 라벨이 있으면 잡힌다.
             v1_web 유닛 계약도 같은 방식이다(queryByText 정확 일치) — 한 질문에 판정식은 하나.
             (이 주석은 템플릿 리터럴 안이라 백틱을 쓸 수 없다 — 쓰면 evaluate 인자가 깨진다.) */
          feeLabels: [...document.querySelectorAll('*')]
            .filter((el) => el.children.length === 0 && el.textContent?.trim() === '참가비').length,
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
            det.feeLabels > 0 && `참가비 라벨 ${det.feeLabels}개`,
            det.capacityBars > 0 && `정원 진행바 ${det.capacityBars}개`,
          ].filter(Boolean);
          record('3-리그상세', leaks.length === 0 ? 'PASS' : 'FAIL',
            leaks.length === 0
              ? `본문 렌더 확인(팀참가=${det.hasTeamJoin} 순위=${det.hasStandings}) · 정원·참가비·성별 전부 없음`
              : `새는 것: ${leaks.join(' / ')}`);
        }
      }

      // ── 대조군: 대회 상세 ──
      /**
       * **판정식이 실제로 무언가를 잡는지 증명한다.**
       *
       * "리그에 참가비 라벨이 없다" 는 판정식이 **아무것도 못 잡는 것**이어도 통과한다(오늘
       * 여러 번 잡은 vacuous). 진짜 변이는 `entryFee` 를 0 아닌 값으로 새게 하는 것인데
       * 그건 **alpha 데이터 변경**이라 사용자 승인 없이 못 한다. 대신 **같은 판정식을 대회에
       * 적용**한다 — 대회에는 참가비 라벨이 **있어야** 하고, 안 나오면 판정식이 죽은 것이다.
       */
      if (vp.key === 'mobile') {
        const ctrlRes = await page.goto(`${BASE}/tournaments/${tournamentId}`, GOTO);
        await page.waitForTimeout(5000);
        const ctrl = await page.evaluate(`(() => {
          const leaf = (t) => [...document.querySelectorAll('*')]
            .filter((el) => el.children.length === 0 && el.textContent?.trim() === t).length;
          return {
            len: document.body.innerText.length,
            feeLabels: leaf('참가비'),
            capacityBars: [...document.querySelectorAll('[role="progressbar"]')]
              .filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('정원')).length,
          };
        })()`);
        if (ctrl.len < 500) {
          record('3b-대조군', 'INCONCLUSIVE',
            `대회 상세 본문이 안 그려졌다 (status ${ctrlRes?.status()}, ${ctrl.len}자)`);
        } else {
          record('3b-대조군', ctrl.feeLabels > 0 ? 'PASS' : 'FAIL',
            ctrl.feeLabels > 0
              ? `대회 상세에 참가비 라벨 ${ctrl.feeLabels}개 · 정원 진행바 ${ctrl.capacityBars}개 — 판정식이 살아 있다`
              : '대회 상세에도 참가비 라벨이 0개다 — **판정식이 아무것도 못 잡는다**(리그 판정 무효)');
        }
      }

      // ── /league-matches (판정 1 비교 대상) ──
      const lmRes = await page.goto(`${BASE}/league-matches`, GOTO);
      await page.waitForTimeout(4000);
      const lmStatus = lmRes?.status();
      await page.screenshot({ path: `${OUT}/league-matches-${vp.key}.png`, fullPage: false });
      const lmTop = await page.evaluate(topOf('[role="list"][aria-label="리그 목록"] > *'));

      if (vp.key === 'mobile') {
        /**
         * 판정 1 — **세그먼트가 첫 카드를 얼마나 밀었나.**
         *
         * ## 옛 기준(`/tournaments` vs `/league-matches` 차이 ≤100px)은 폐기했다
         * 두 이유로 답을 못 준다:
         * 1. **두 항의 조건이 다르다.** `/tournaments` 는 프로모 캐러셀(207px)+배너(65px)를
         *    이고 있고 `/league-matches` 는 아니다. 차이의 대부분이 우리와 무관한 요소다.
         *    실제로 옛 기준값 128px 은 캐러셀이 안 뜬 순간의 값이었다(548-64=484 여야 한다).
         * 2. **리다이렉트가 붙으면 비교 대상이 사라진다.** 두 탭이 같은 페이지가 되므로
         *    첫 카드 top 이 구조적으로 같아져 이 판정이 무의미해진다.
         *
         * 그래서 **비교를 버리고 우리 몫만 잰다** — 세그먼트가 차지한 세로. 한 줄(터치 타깃
         * 44 + 패딩)이면 정상이고, 두 줄로 늘어나면 100px 을 넘어 잡힌다.
         */
        const segH = list.segHeight;
        const segMb = list.segMarginBottom;
        if (segH === null) {
          record('1-세그먼트몫', 'INCONCLUSIVE',
            `세그먼트를 못 찾았다 (status ${listStatus}) — 첫 카드 top=${list.firstCardTop}`);
        } else {
          const added = segH + segMb;
          record('1-세그먼트몫', added <= 80 ? 'PASS' : 'FAIL',
            `세그먼트가 더한 세로 ${added}px (height ${segH} + margin ${segMb}, 기준 ≤80 = 한 줄)` +
              ` · 참고: 첫 카드 top ${list.firstCardTop}px, /league-matches ${lmTop}px`);
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
