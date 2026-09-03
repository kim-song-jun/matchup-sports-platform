#!/usr/bin/env node
/**
 * alpha 모션 카탈로그 녹화기.
 *
 * 각 내비게이션 흐름(탭 전환/push/pop/서브탭/필터시트/알림시트/모달/스켈레톤 등)을
 * 새 브라우저 컨텍스트에서 열어 비디오로 녹화하고, 동시에 startViewTransition 호출·
 * getAnimations() 스냅샷·스켈레톤 노출 시간을 계측한다. 녹화가 끝나면 ffmpeg 로
 * GIF + 전환 구간 컨택트시트를 만든다.
 *
 * 참고 하네스(관례를 따름): measure-transition-actually-runs.mjs,
 * verify-alpha-motion.mjs, verify-alpha-shell-motion.mjs.
 *
 * 실행 (레포 루트 기준 — 캡처 스크립트는 scripts/ 안에 둔다, /tmp 는 모듈 해석 실패):
 *   ALPHA_SESSION_TOKEN='v1.<payload>.<HMAC>' node scripts/record-alpha-motion-catalog.mjs \
 *     --viewport mobile --flows tab-home-matches,push-pop-tournament --out /path/to/out
 *
 * 옵션:
 *   --viewport mobile|desktop|tablet   (기본 mobile — 390x844 / 1440x900 / 768x1024)
 *   --flows a,b,c                      (기본: 전체 FLOW_IDS)
 *   --out <dir>                        (기본: 스크래치패드/motion-audit/recordings)
 *   --slow                             (CDP Network throttling 으로 3G 급 재현)
 *   --reduced                          (prefers-reduced-motion: reduce 에뮬레이션)
 *
 * 자격증명은 절대 코드에 넣지 않는다 — ALPHA_SESSION_TOKEN 환경변수로만 받는다
 * (이 저장소는 public). 값이 없으면 즉시 에러로 중단한다.
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const SESSION_TOKEN = process.env.ALPHA_SESSION_TOKEN ?? '';
// PATH 의 ffmpeg 를 쓴다(macOS Homebrew 경로 고정은 다른 환경에서 깨진다). 필요하면 env 로만 덮어쓴다.
const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';

// 산출물(webm·gif·png)은 크고 세션마다 다르므로 저장소 밖 임시 디렉터리를 기본으로 한다 — --out 으로 덮어쓴다.
const DEFAULT_OUT = resolve(tmpdir(), 'teameet-motion-catalog');

// 흐름마다 마지막 page.goto 의 HTTP 상태 — gotoChecked 가 갱신하고 summary 에 기록한다.
let lastHttpStatus = null;

/** throw 된 값이 Error 가 아닐 수도 있다(문자열·객체) — 메시지를 안전하게 문자열화한다. */
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true },
  tablet: { width: 768, height: 1024, isMobile: false },
  desktop: { width: 1440, height: 900, isMobile: false },
};

const FLOW_IDS = [
  'tab-home-matches',
  'push-pop-tournament',
  'browser-back',
  'subtab-tournament-detail',
  'filter-sheet',
  'skeleton-slow',
  'notification-sheet',
  'card-hover',
  'my-page',
  'modal',
];

// ── CLI 인자 파싱 ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { viewport: 'mobile', flows: FLOW_IDS.slice(), out: DEFAULT_OUT, slow: false, reduced: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // 값을 받는 옵션은 다음 토큰이 없거나 또 다른 옵션이면 즉시 실패 — argv[++i] 가 undefined 인 채로
    // .split 을 부르면 TypeError 로 원인이 가려진다(Copilot).
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} 에 값이 없습니다`);
      i += 1;
      return v;
    };
    if (a === '--viewport') out.viewport = value();
    else if (a === '--flows') out.flows = value().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') out.out = value();
    else if (a === '--slow') out.slow = true;
    else if (a === '--reduced') out.reduced = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (!VIEWPORTS[out.viewport]) throw new Error(`--viewport 는 mobile|desktop|tablet 중 하나 (받음: ${out.viewport})`);
  const unknownFlow = out.flows.find((f) => !FLOW_IDS.includes(f));
  if (unknownFlow) throw new Error(`알 수 없는 흐름: ${unknownFlow} (가능: ${FLOW_IDS.join(', ')})`);
  return out;
}

// alpha 는 과한 캡처에 IP 단위 403 을 약 1분 건다(메모리: alpha-rate-limits-heavy-capture).
// 흐름 사이 1.5초 이상 간격 + 200 이 아니면 그 흐름 실패로 표시하고 60초 대기 후 계속.
const pace = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoChecked(page, path, { waitMs = 1500 } = {}) {
  // 라이브 경기 페이지는 10초 폴링이라 networkidle 이 끝나지 않는다 → domcontentloaded.
  let res = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  let status = res?.status() ?? 0;
  if (status === 403) {
    // alpha nginx 의 IP 단위 레이트리밋(약 1분). 그냥 skip 으로 넘기면 뒤 흐름 전부가
    // 403 으로 건너뛰어진다(첫 데스크톱 실행: 10개 중 8개 skip). 65초 쉬고 한 번 더 시도.
    console.log(`  403 (${path}) — 레이트리밋 의심, 65초 대기 후 1회 재시도`);
    await page.waitForTimeout(65_000);
    res = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    status = res?.status() ?? 0;
  }
  lastHttpStatus = status;
  await page.waitForTimeout(waitMs);
  return status;
}

// ── 계측 init script ─────────────────────────────────────────────────────────
// 이 함수는 page.addInitScript 로 페이지 컨텍스트에 직렬화돼 들어간다 —
// 바깥 스코프 변수를 캡처하지 않는다(playwright 제약).
function installTelemetry() {
  window.__motion = {
    vtCalls: 0,
    events: [], // { kind: 'animationstart'|'transitionstart', name, target, t }
    navKindHistory: [],
    lastTransitionStartedAt: null,
  };

  const shortTarget = (el) => {
    if (!el || !el.tagName) return '(no target)';
    const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
  };

  const origVT = document.startViewTransition?.bind(document);
  if (origVT) {
    document.startViewTransition = (cb) => {
      window.__motion.vtCalls++;
      window.__motion.lastTransitionStartedAt = performance.now();
      return origVT(cb);
    };
  } else {
    window.__motion.vtUnsupported = true;
  }

  for (const kind of ['animationstart', 'transitionstart']) {
    document.addEventListener(
      kind,
      (e) => {
        window.__motion.events.push({
          kind,
          name: e.animationName || e.propertyName || '(unknown)',
          target: shortTarget(e.target),
          t: performance.now(),
        });
      },
      true,
    );
  }

  // data-nav-kind 변화도 기록 — PageTransitionController 가 이 값을 세팅한다.
  const observer = new MutationObserver(() => {
    const kind = document.documentElement.dataset.navKind;
    if (kind) window.__motion.navKindHistory.push({ kind, t: performance.now() });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav-kind'] });
}

async function resetTelemetry(page) {
  await page.evaluate(() => {
    window.__motion.vtCalls = 0;
    window.__motion.events = [];
    window.__motion.navKindHistory = [];
    window.__motion.lastTransitionStartedAt = null;
  });
}

async function readTelemetry(page) {
  return page.evaluate(() => window.__motion);
}

// document.getAnimations() 를 지정 시각에 스냅샷 — currentTime/playState/effect target.
async function snapshotAnimations(page, label) {
  return page.evaluate((label) => {
    const anims = document.getAnimations();
    return {
      label,
      t: performance.now(),
      count: anims.length,
      animations: anims.slice(0, 30).map((a) => {
        const eff = a.effect;
        const target = eff && 'target' in eff ? eff.target : null;
        const cls = target && typeof target.className === 'string' ? target.className.split(' ').slice(0, 2).join('.') : '';
        const timing = eff?.getComputedTiming?.() ?? {};
        return {
          animationName: a.animationName ?? null,
          id: a.id || null,
          playState: a.playState,
          currentTime: typeof a.currentTime === 'number' ? Math.round(a.currentTime) : a.currentTime,
          duration: timing.duration ?? null,
          targetTag: target?.tagName ? target.tagName.toLowerCase() + (cls ? '.' + cls : '') : null,
        };
      }),
    };
  }, label);
}

// 전환 직후 100ms/400ms/800ms 시점에 getAnimations 스냅샷을 찍는다.
async function snapshotAnimationSeries(page) {
  const series = [];
  for (const delay of [100, 400, 800]) {
    await page.waitForTimeout(delay - (series.length ? [100, 400, 800][series.length - 1] : 0));
    series.push(await snapshotAnimations(page, `+${delay}ms`));
  }
  return series;
}

// 전환 후 첫 콘텐츠 페인트까지 시간 — .tm-skeleton 개수를 100ms 간격으로 폴링.
async function pollSkeletonUntilGone(page, { timeoutMs = 6000, intervalMs = 100 } = {}) {
  const start = Date.now();
  let sawSkeleton = false;
  let firstContentMs = null;
  while (Date.now() - start < timeoutMs) {
    const count = await page.evaluate(() => document.querySelectorAll('.tm-skeleton').length).catch(() => 0);
    if (count > 0) sawSkeleton = true;
    if (sawSkeleton && count === 0) {
      firstContentMs = Date.now() - start;
      break;
    }
    if (!sawSkeleton && count === 0 && Date.now() - start > 400) {
      // 스켈레톤이 애초에 안 뜨는 흐름 — 짧게만 더 확인하고 종료
      firstContentMs = Date.now() - start;
      break;
    }
    await pace(intervalMs);
  }
  return { skeletonSeen: sawSkeleton, firstContentMs };
}

async function readScrollPosition(page) {
  return page.evaluate(() => {
    const area = document.querySelector('.tm-scroll-area');
    return area ? { scrollTop: area.scrollTop, scrollHeight: area.scrollHeight } : { scrollTop: null, scrollHeight: null };
  });
}

// ── ffmpeg 후처리 ────────────────────────────────────────────────────────────
async function ffmpegGif(videoPath, gifPath, widthPx) {
  const filter = `fps=12,scale=${widthPx}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`;
  await execFileAsync(FFMPEG, ['-y', '-i', videoPath, '-vf', filter, gifPath]);
}

// 전환 구간(centerMs, 페이지 로드 시작 기준) ±1.2초를 60ms 간격으로 잘라 6열 타일.
async function ffmpegContactSheet(videoPath, sheetPath, centerSec, widthPx) {
  const startSec = Math.max(0, centerSec - 1.2);
  const durationSec = 2.4;
  // 60ms 간격 = ~16.67fps, 2.4초 구간이면 40프레임 → 6x7 타일(마지막 줄 일부 빈칸 허용)
  const filter = `fps=1000/60,scale=${widthPx}:-1:flags=lanczos,tile=6x7`;
  await execFileAsync(FFMPEG, [
    '-y',
    '-ss',
    String(startSec),
    '-t',
    String(durationSec),
    '-i',
    videoPath,
    '-vf',
    filter,
    sheetPath,
  ]);
}

// ── 흐름 정의 ─────────────────────────────────────────────────────────────────
// 각 흐름은 (ctx, page, opts) 를 받아 { transitionCenterSec, notes[] } 를 반환한다.
// transitionCenterSec 은 비디오 시작(첫 goto 호출 시점)을 0으로 한 초 단위 오프셋.
// 셀렉터가 없으면 { skipped: true, reason } 을 반환 — 빈 catch 로 삼키지 않는다.

const TAB_CONTAINER_SELECTOR =
  '.tm-bottom-nav, .tm-desktop-nav-tabs, .tm-segmented-tabs';

async function clickTabTo(page, href) {
  // 하단 탭과 데스크톱 탭은 둘 다 DOM 에 있고 CSS 로 한쪽만 보인다 — 보이는 쪽을 누른다.
  // (데스크톱 첫 실행: 숨은 .tm-bottom-tab 을 잡아 30초 타임아웃으로 실패)
  for (const sel of [`.tm-bottom-tab[href="${href}"]`, `.tm-desktop-nav-tab[href="${href}"]`]) {
    const el = await page.$(sel);
    if (el && (await el.isVisible())) {
      await el.click();
      return true;
    }
  }
  return false;
}

const FLOWS = {
  async 'tab-home-matches'(ctx, page, { videoStart }) {
    const notes = [];
    const statusHome = await gotoChecked(page, '/home');
    if (statusHome !== 200) return { skipped: true, reason: `/home → HTTP ${statusHome}` };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    const clicked = await clickTabTo(page, '/matches');
    if (!clicked) return { skipped: true, reason: '탭 셀렉터(.tm-bottom-tab|.tm-desktop-nav-tab[href="/matches"])를 찾지 못함' };
    await page.waitForTimeout(600);
    await clickTabTo(page, '/home');
    await page.waitForTimeout(600);
    notes.push('home→matches→home 왕복 탭 전환');
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'push-pop-tournament'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/tournaments');
    if (status !== 200) return { skipped: true, reason: `/tournaments → HTTP ${status}` };
    await resetTelemetry(page);
    // 느린 회선(--slow)에서는 목록이 1.5초 안에 안 온다 — 카드가 보일 때까지 기다린다.
    const card = await page
      .waitForSelector('.tm-scroll-area a[href^="/tournaments/"]', { state: 'visible', timeout: 20_000 })
      .catch(() => null);
    if (!card) return { skipped: true, reason: '대회 카드 링크(.tm-scroll-area a[href^="/tournaments/"])가 20초 안에 보이지 않음' };
    const t0 = (Date.now() - videoStart) / 1000;
    await card.click(); // push
    await page.waitForTimeout(1200);
    // 데스크톱은 .tm-desktop-back, 모바일은 상단 ‹ — 둘 다 data-nav-back 이지만 한쪽만 보인다.
    let backLink = null;
    for (const el of await page.$$('[data-nav-back="true"]')) if (await el.isVisible()) { backLink = el; break; }
    if (!backLink) {
      notes.push('push 는 재생됐으나 [data-nav-back="true"] (‹) 를 찾지 못해 pop 은 생략');
      return { transitionCenterSec: t0 + 0.3, notes };
    }
    await backLink.click(); // pop
    await page.waitForTimeout(1200);
    notes.push('목록→상세(push)→‹(pop) 왕복');
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'browser-back'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/tournaments');
    if (status !== 200) return { skipped: true, reason: `/tournaments → HTTP ${status}` };
    const card = await page.$('.tm-scroll-area a[href^="/tournaments/"]');
    if (!card) return { skipped: true, reason: '대회 카드 링크를 찾지 못함' };
    await card.click();
    await page.waitForTimeout(1200);
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    await page.goBack({ waitUntil: 'domcontentloaded' }); // popstate pop
    await page.waitForTimeout(1200);
    notes.push('page.goBack() → popstate 기반 pop');
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'subtab-tournament-detail'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/tournaments');
    if (status !== 200) return { skipped: true, reason: `/tournaments → HTTP ${status}` };
    // 세부 탭(전체 / 정규 대회 / 정규 리그)은 대회 목록 자체에 있다 — 대회 상세(캠페인)
    // 페이지엔 세그먼트 탭이 1개뿐이라 상세로 들어가면 재현이 안 된다(재실행 실측 visible 1/2).
    // 하단 탭·데스크톱 탭은 뷰포트에 따라 숨겨진다 — 보이는 앵커만 고르지 않으면
    // "element is not visible" 로 30초 타임아웃 후 실패한다(첫 실행 실측).
    const allTabs = await page.$$(`.tm-segmented-tabs a`);
    const tabs = [];
    for (const t of allTabs) if (await t.isVisible()) tabs.push(t);
    if (tabs.length < 2) return { skipped: true, reason: `대회 상세 안 보이는 세부 탭 앵커가 2개 미만 (visible ${tabs.length}/${allTabs.length})` };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    await tabs[1].click();
    await page.waitForTimeout(600);
    await tabs[0].click();
    await page.waitForTimeout(600);
    notes.push(`대회 목록 세부 탭 2회 전환 (보이는 탭 ${tabs.length}개 중 0↔1)`);
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'filter-sheet'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/tournaments');
    if (status !== 200) return { skipped: true, reason: `/tournaments → HTTP ${status}` };
    const openLink = await page.$('a[aria-label^="필터 열기"]');
    if (!openLink) return { skipped: true, reason: '필터 열기 앵커(a[aria-label^="필터 열기"])를 찾지 못함' };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    await openLink.click();
    await page.waitForTimeout(700);
    const closeLink = await page.$('a[aria-label="필터 닫기"], .tm-filter-scrim');
    if (closeLink) {
      await closeLink.click();
      await page.waitForTimeout(700);
      notes.push('필터 열기(a[aria-label^="필터 열기"]) → 닫기(.tm-filter-scrim)');
    } else {
      notes.push('열기는 성공, 닫기 셀렉터(.tm-filter-scrim)를 못 찾아 열린 채로 종료');
    }
    return { transitionCenterSec: t0 + 0.35, notes };
  },

  async 'skeleton-slow'(ctx, page, { videoStart, opts }) {
    const notes = [];
    if (!opts.slow) notes.push('--slow 없이 실행됨 — 스켈레톤 창이 짧을 수 있다');
    const status = await gotoChecked(page, '/tournaments', { waitMs: 500 });
    if (status !== 200) return { skipped: true, reason: `/tournaments → HTTP ${status}` };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    const clicked = await clickTabTo(page, '/teams');
    if (!clicked) return { skipped: true, reason: '탭 셀렉터(/teams)를 찾지 못함' };
    const skel = await pollSkeletonUntilGone(page, { timeoutMs: 8000 });
    notes.push(`스켈레톤 관측=${skel.skeletonSeen} firstContentMs=${skel.firstContentMs}`);
    return { transitionCenterSec: t0 + 0.3, notes, skeleton: skel };
  },

  async 'notification-sheet'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/home');
    if (status !== 200) return { skipped: true, reason: `/home → HTTP ${status}` };
    // NotificationBellLink 는 /notifications 로 이동하는 Link — "시트"가 아니라
    // 풀페이지 전환이다. 실제 시트 토글 요소(버튼+role=dialog)가 있으면 그걸 쓰고,
    // 없으면 링크 기반 전환을 기록하고 이유를 남긴다.
    const bellButtonAny = await page.$('button[aria-label*="알림"]');
    const bellButton = bellButtonAny && (await bellButtonAny.isVisible()) ? bellButtonAny : null;
    if (bellButton) {
      await resetTelemetry(page);
      const t0 = (Date.now() - videoStart) / 1000;
      await bellButton.click();
      await page.waitForTimeout(700);
      const dialog = await page.$('[role="dialog"]');
      if (dialog) {
        const closeBtn = await page.$('[role="dialog"] button[aria-label*="닫기"], [role="dialog"] button[aria-label*="close" i]');
        if (closeBtn) await closeBtn.click();
        else await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        notes.push('알림 버튼(button[aria-label*="알림"]) → role=dialog 열기/닫기');
      } else {
        notes.push('알림 버튼 클릭 후 role=dialog 를 못 찾음(시트가 아니라 인라인 토글일 수 있음)');
      }
      return { transitionCenterSec: t0 + 0.35, notes };
    }
    const bellLinks = await page.$$('a[aria-label*="알림"]');
    let bellLink = null;
    for (const l of bellLinks) if (await l.isVisible()) { bellLink = l; break; }
    if (!bellLink) return { skipped: true, reason: `보이는 알림 버튼/링크(aria-label*="알림")를 찾지 못함 (hidden ${bellLinks.length})` };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    await bellLink.click();
    await page.waitForTimeout(1000);
    notes.push('알림은 시트가 아니라 /notifications 풀페이지 링크(NotificationBellLink) — push 전환으로 기록');
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'card-hover'(ctx, page, { videoStart, opts }) {
    if (opts.viewport !== 'desktop') return { skipped: true, reason: 'card-hover 는 desktop 전용 흐름' };
    const notes = [];
    const status = await gotoChecked(page, '/matches');
    if (status !== 200) return { skipped: true, reason: `/matches → HTTP ${status}` };
    const card = await page.$('.tm-scroll-area a[href^="/matches/"], .tm-scroll-area [class*="card"]');
    if (!card) return { skipped: true, reason: '매치 카드 요소를 찾지 못함' };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    for (let i = 0; i < 3; i++) {
      await card.hover();
      await page.waitForTimeout(250);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(250);
    }
    notes.push('카드 hover in/out 3회');
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'my-page'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/home');
    if (status !== 200) return { skipped: true, reason: `/home → HTTP ${status}` };
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    const clicked = await clickTabTo(page, '/my');
    if (!clicked) return { skipped: true, reason: '탭 셀렉터(/my)를 찾지 못함' };
    await page.waitForTimeout(1200);
    notes.push('RequireAuth 게이트 통과 후 /my 콘텐츠 진입');
    return { transitionCenterSec: t0 + 0.3, notes };
  },

  async 'modal'(ctx, page, { videoStart }) {
    const notes = [];
    const status = await gotoChecked(page, '/my');
    if (status !== 200) return { skipped: true, reason: `/my → HTTP ${status}` };
    // 파괴적 액션(로그아웃 버튼 등)은 확인 모달 없이 즉시 실행되므로 절대 클릭하지 않는다
    // (LogoutButton — 확인 모달을 거치지 않고 바로 로그아웃 mutate 호출, page-transition-controller.tsx
    // 리뷰 결과 확인됨). 안전하게 식별 가능한 것은 aria-haspopup="dialog" 뿐이라 그것만 프로브한다.
    const opener = await page.$('[aria-haspopup="dialog"]');
    if (!opener) {
      return {
        skipped: true,
        reason:
          '/my 에서 안전하게 식별 가능한 모달 오프너([aria-haspopup="dialog"])를 찾지 못함 — ' +
          '로그아웃 버튼은 확인 모달 없이 즉시 실행되므로 의도적으로 클릭하지 않음',
      };
    }
    await resetTelemetry(page);
    const t0 = (Date.now() - videoStart) / 1000;
    await opener.click();
    await page.waitForTimeout(500);
    const dialog = await page.$('[role="dialog"]');
    if (dialog) {
      const cancelBtn = await page.$('[role="dialog"] button:has-text("취소")');
      if (cancelBtn) await cancelBtn.click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      notes.push('[aria-haspopup="dialog"] 열기 → 취소로 닫기');
    } else {
      notes.push('오프너 클릭 후 role=dialog 를 못 찾음');
    }
    return { transitionCenterSec: t0 + 0.3, notes };
  },
};

// ── 메인 실행 ─────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!SESSION_TOKEN) {
    throw new Error('ALPHA_SESSION_TOKEN 환경변수가 없다 — 자격증명은 코드에 넣지 않는다(이 저장소는 public).');
  }
  const vp = VIEWPORTS[opts.viewport];
  const outRoot = resolve(opts.out, opts.viewport);
  mkdirSync(outRoot, { recursive: true });

  // 배포 중엔 502 — 시작 시 health 확인.
  const healthRes = await fetch(`${ORIGIN}/api/v1/health`).catch((e) => ({ ok: false, _err: e }));
  if (!healthRes.ok) {
    throw new Error(`/api/v1/health 가 정상이 아니다(배포 중일 수 있음): ${healthRes.status ?? healthRes._err?.message}`);
  }

  const browser = await chromium.launch();
  const summary = { origin: ORIGIN, viewport: opts.viewport, slow: opts.slow, reduced: opts.reduced, flows: {} };

  try {
    for (const flowId of opts.flows) {
      const flowDir = resolve(outRoot, flowId);
      mkdirSync(flowDir, { recursive: true });
      console.log(`\n▶ ${flowId} (${opts.viewport})`);

      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        recordVideo: { dir: flowDir, size: { width: vp.width, height: vp.height } },
        reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
      });
      await ctx.addCookies([
        {
          name: 'teameet_v1_session',
          value: SESSION_TOKEN,
          domain: new URL(ORIGIN).hostname, // ALPHA_ORIGIN 을 바꾸면 쿠키도 그 호스트를 따라간다
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ]);
      await ctx.addInitScript(installTelemetry);

      let cdpClient = null;
      if (opts.slow) {
        // CDP Network throttling 으로 3G 급 느린 로딩을 재현 — "로딩이 느릴 때 전환이
        // 먼저 도는" 케이스(스켈레톤 창이 길게 벌어지는 경우)를 잡기 위함.
        cdpClient = await ctx.newCDPSession(await ctx.newPage());
        await cdpClient.send('Network.enable');
        await cdpClient.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 400,
          downloadThroughput: (400 * 1024) / 8,
          uploadThroughput: (400 * 1024) / 8,
        });
      }
      const page = cdpClient ? ctx.pages()[0] : await ctx.newPage();

      const videoStart = Date.now();
      let flowResult;
      let httpStatus = null;
      lastHttpStatus = null;
      let telemetry = null;
      let animationSeries = [];
      let finalScroll = null;
      let status = 'ok';
      let error = null;

      try {
        const runner = FLOWS[flowId];
        if (!runner) throw new Error(`정의되지 않은 흐름: ${flowId}`);
        flowResult = await runner(ctx, page, { videoStart, opts });

        if (flowResult?.skipped) {
          status = 'skipped';
        } else {
          telemetry = await readTelemetry(page);
          animationSeries = await snapshotAnimationSeries(page);
          finalScroll = await readScrollPosition(page);
        }
      } catch (err) {
        status = 'failed';
        error = errorMessage(err);
        console.error(`  ✗ ${flowId} 실패: ${error}`);
        // alpha 403 레이트리밋 의심 시 60초 대기 후 나머지 흐름 계속.
        if (/HTTP 403|403/.test(error)) {
          console.log('  403 감지 — 60초 대기 후 계속');
          await pace(60_000);
        }
      }

      const videoHandle = page.video();
      const ffmpegNotes = [];
      try {
        await page.close();
      } catch (closeErr) {
        // 닫기 실패는 녹화 파일이 완결되지 않았을 수 있다는 뜻 — 조용히 삼키지 않고 기록한다.
        console.warn(`  ⚠ ${flowId} page.close 실패: ${errorMessage(closeErr)}`);
        ffmpegNotes.push(`page.close 실패: ${errorMessage(closeErr)}`);
      }
      await ctx.close(); // recordVideo 는 컨텍스트가 닫혀야 파일이 완결된다

      // video.path() 는 page/context 가 닫힌 뒤 호출해야 완결된 파일 경로를 준다
      // (playwright 계약) — close 전에 호출하면 아직 안 끝난 파일을 가리킬 수 있다.
      // page.video() 는 Video | null — null 이면 optional chaining 결과(undefined)에 .catch 를 붙이다
      // TypeError 가 난다. path() 의 Promise 에만 catch 를 건다.
      const videoPath = videoHandle ? await videoHandle.path().catch(() => null) : null;
      let resolvedVideoPath = videoPath;
      if (!resolvedVideoPath) {
        // 폴백: flowDir 안의 유일한 .webm 파일을 찾는다.
        const { readdirSync } = await import('node:fs');
        const webm = readdirSync(flowDir).find((f) => f.endsWith('.webm'));
        resolvedVideoPath = webm ? resolve(flowDir, webm) : null;
      }

      const finalVideoPath = resolve(flowDir, 'video.webm');
      if (resolvedVideoPath && resolvedVideoPath !== finalVideoPath && existsSync(resolvedVideoPath)) {
        const { renameSync } = await import('node:fs');
        renameSync(resolvedVideoPath, finalVideoPath);
      }

      const gifPath = resolve(flowDir, 'clip.gif');
      const sheetPath = resolve(flowDir, 'sheet.png');
      if (status !== 'failed' && existsSync(finalVideoPath)) {
        try {
          const gifWidth = opts.viewport === 'desktop' ? 720 : 390;
          await ffmpegGif(finalVideoPath, gifPath, gifWidth);
        } catch (e) {
          ffmpegNotes.push(`GIF 생성 실패: ${errorMessage(e)}`);
        }
        if (flowResult?.transitionCenterSec != null) {
          try {
            const sheetWidth = opts.viewport === 'desktop' ? 480 : 260;
            await ffmpegContactSheet(finalVideoPath, sheetPath, flowResult.transitionCenterSec, sheetWidth);
          } catch (e) {
            ffmpegNotes.push(`컨택트시트 생성 실패: ${errorMessage(e)}`);
          }
        } else if (status === 'ok') {
          ffmpegNotes.push('전환 시각(transitionCenterSec) 미기록 — 컨택트시트 생략');
        }
      }

      const telemetryOut = {
        flowId,
        viewport: opts.viewport,
        status,
        error,
        skippedReason: flowResult?.skipped ? flowResult.reason : null,
        notes: flowResult?.notes ?? [],
        vtCalls: telemetry?.vtCalls ?? null,
        vtUnsupported: telemetry?.vtUnsupported ?? null,
        events: telemetry?.events ?? [],
        navKindHistory: telemetry?.navKindHistory ?? [],
        animationSeries,
        finalScroll,
        transitionCenterSec: flowResult?.transitionCenterSec ?? null,
        skeleton: flowResult?.skeleton ?? null,
        ffmpegNotes,
      };
      writeFileSync(resolve(flowDir, 'telemetry.json'), JSON.stringify(telemetryOut, null, 2));

      httpStatus = lastHttpStatus;
      summary.flows[flowId] = {
        status,
        httpStatus,
        vtCalls: telemetry?.vtCalls ?? null,
        animationCount: animationSeries.reduce((m, s) => Math.max(m, s.count), 0),
        firstContentMs: flowResult?.skeleton?.firstContentMs ?? null,
        skeletonSeen: flowResult?.skeleton?.skeletonSeen ?? null,
        notes: (flowResult?.notes ?? []).concat(ffmpegNotes),
        error,
      };

      console.log(`  ${status === 'ok' ? '✓' : status === 'skipped' ? '–' : '✗'} ${flowId}: ${status}`);

      await pace(1500); // 흐름 사이 간격
    }
  } finally {
    await browser.close();
  }

  writeFileSync(resolve(outRoot, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n===== ${opts.viewport} 요약 =====`);
  for (const [flowId, r] of Object.entries(summary.flows)) {
    console.log(
      `${r.status.padEnd(8)} ${flowId.padEnd(28)} vt=${r.vtCalls ?? '-'} anim=${r.animationCount ?? '-'} firstContentMs=${r.firstContentMs ?? '-'}` +
        (r.error ? ` ERROR=${r.error}` : ''),
    );
  }
  console.log(`\n결과: ${outRoot}`);
}

main()
  .then(() => {
    // recordVideo 의 ffmpeg 파이프가 browser.close() 뒤에도 이벤트 루프를 붙들어
    // 프로세스가 끝나지 않는 경우가 있다(첫 실행: summary 를 쓴 뒤 14분간 종료 안 됨).
    // 산출물은 전부 동기 write 로 끝났으므로 여기서 명시적으로 종료한다.
    process.exit(0);
  })
  .catch((err) => {
    console.error(`치명적 오류: ${errorMessage(err)}`);
    process.exit(1);
  });
