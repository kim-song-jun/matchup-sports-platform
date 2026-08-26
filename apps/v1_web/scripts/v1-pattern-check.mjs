#!/usr/bin/env node
/**
 * v1_web 코딩 패턴 enforcement (docs/v1-coding-patterns.md 강제).
 *
 * 배포 준비 세션에서 0으로 정리한 안티패턴의 **회귀를 차단**한다. CI/lint에서 실행해
 * 위반 시 비-0 종료. 패턴은 문서뿐 아니라 이 검사로 "기본 개발방식에 녹아" 강제된다.
 *
 * 검사:
 *  1) 합니다체(입니다/습니다/됩니다/합니다 등) — 사용자 노출 UI 문자열은 해요체 단일 어조.
 *  2) 미정의 CSS 토큰 — globals.css가 var(--x)로 참조하지만 정의도 fallback도 없는 토큰
 *     (런타임 silent fail 방지, WS1 사고 재발 차단).
 *  3) 무효한 폰트 크기 토큰 클래스. Tailwind v4 는
 *     `text-[...]` 안의 맨 var() 를 **색상**으로 해석해 `color: var(--font-size-x)` 를
 *     내보낸다. 폰트 크기가 아예 안 걸리고 부모 크기를 상속하는데, 클래스 이름만 보면
 *     맞아 보여서 코드 리뷰로는 안 잡힌다(2026-08-18 실측: h1 24px 의도 → 16px 렌더,
 *     42개 파일 168곳). 임의값의 타입을 `length:` 로 명시해야 크기로 해석된다.
 *
 *     주의 — 이 주석에 그 클래스 형태를 **그대로 적지 않는다.** Tailwind 스캐너는
 *     주석·문자열을 가리지 않고 후보를 줍기 때문에, 예시로 적은 자리표시자까지
 *     실제 클래스로 만들어 CSS 를 생성한다(`<이름>` 같은 걸 넣었더니 `<` 가 든
 *     CSS 가 나와 **빌드가 깨졌다** — 2026-08-18). 형태는 아래 정규식과 위반
 *     메시지가 이미 정확히 보여준다.
 *
 * 사용: node scripts/v1-pattern-check.mjs   (apps/v1_web에서)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const violations = [];

/* ── 1) 합니다체 검사 ──────────────────────────────────────────────── */
// 의도적 예외(코드 로직·비-UI): 변경 시 분기 깨지거나 사용자 콘텐츠/주석.
const HAPNIDA_ALLOW = [
  'matches-create-client.tsx:299', // oldDefaults 비교 baseline(line 299, 비-UI) — 파일 전체 아닌 해당 라인만 면제
  'community.view-model.ts', // mock 채팅 사용자 콘텐츠
  'src/components/auth/terms-client.tsx', // 약관·개인정보·대회 규정 법무성 문서는 합니다체 유지
  'src/app/tournaments/[id]/apply/tournament-apply-client.tsx', // 대회 신청 약관·환불·촬영 동의 법무성 문구
  'src/app/tournaments/[id]/tournament-detail-client.tsx', // 대회 상세 규정 요약 법무성 문구
  'src/app/tournaments/[id]/my/my-registration-client.tsx', // 신청/입금/확정 고지성 문구
  'src/test/', // 테스트 fixture
];
function checkHapnida() {
  let out = '';
  try {
    // *.test.* 제외: 테스트 단언 문자열은 사용자 노출 UI 카피가 아니라 검증 데이터
    // (예: 백엔드 메시지 변경 회귀 가드는 구·신 문자열을 모두 비교해야 함).
    out = execSync(
      `grep -rnE "입니다|습니다|됩니다|랍니다|십니다" src --include="*.tsx" --include="*.ts" --exclude="*.test.ts" --exclude="*.test.tsx" || true`,
      { encoding: 'utf8' },
    );
  } catch { /* grep no-match exits 1 */ }
  for (const line of out.split('\n').filter(Boolean)) {
    // Destructive-action confirmation contracts can intentionally require this exact phrase.
    if (line.includes("confirmationPhrase: '확인했습니다'")) continue;
    const loc = line.split(':').slice(0, 2).join(':');
    if (HAPNIDA_ALLOW.some((a) => {
      // :N 라인 핀은 loc 끝과 정확 일치만 — ':1'이 ':11'·':100' 등에 부분매칭되는 것 방지 (Copilot)
      if (/:\d+$/.test(a)) return loc === a || loc.endsWith('/' + a);
      // 파일/디렉토리 엔트리(community.view-model.ts, src/test/ 등)는 부분 매칭
      return line.includes(a) || loc.includes(a);
    })) continue;
    // 주석 줄 제외(// 또는 * 로 시작)
    const body = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1).trim();
    if (body.startsWith('//') || body.startsWith('*') || body.startsWith('/*')) continue;
    violations.push(`[합니다체] ${line.trim()} → 해요체로`);
  }
}

/* ── 2) 미정의 CSS 토큰 검사 ───────────────────────────────────────── */
// 엔트리 CSS 와 그것이 로컬 @import 하는 파일들을 따라가며 토큰 정의를 모은다.
// globals.css 만 읽으면 tokens.css(치수 계열 SSOT)에 정의된 토큰이 전부 "미정의"로
// 잡힌다 — 정의 위치가 @theme 블록이든 :root 든 이 검사에는 상관없다. 중요한 건
// "런타임에 값이 실제로 존재하는가" 이고, 그건 import 그래프를 따라가야 알 수 있다.
function collectDefinedTokens(entry) {
  const defined = new Set();
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let css;
    try { css = readFileSync(file, 'utf8'); } catch { continue; }
    for (const m of css.matchAll(/(?:^|[\s;{])(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);
    // 상대 경로 @import 만 따라간다 ("tailwindcss" 같은 패키지 import 는 제외)
    for (const m of css.matchAll(/@import\s+["']([^"']+)["']/g)) {
      if (m[1].startsWith('.')) stack.push(join(dirname(file), m[1]));
    }
  }
  return defined;
}

function checkUndefinedTokens() {
  const defined = collectDefinedTokens('src/app/globals.css');
  // tournaments.css 등 desktop css도 참조 대상
  let cssFiles = '';
  try { cssFiles = execSync('find src -name "*.css"', { encoding: 'utf8' }); } catch {}
  for (const f of cssFiles.split('\n').filter(Boolean)) {
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(,[^)]*)?\)/g)) {
      const token = m[1];
      const hasFallback = Boolean(m[2]);
      if (!defined.has(token) && !hasFallback) {
        violations.push(`[미정의 CSS 토큰] ${f}: var(${token}) — :root 정의 또는 fallback 필요`);
      }
    }
  }
}

/* ── 3) 무효한 폰트 크기 토큰 클래스 검사 ─────────────────────────── */
function checkInertFontSizeClasses() {
  let files = '';
  try {
    files = execSync("grep -rl 'text-\\[var(--font-size-' src || true", { encoding: 'utf8' });
  } catch {}
  for (const f of files.split('\n').filter(Boolean)) {
    const txt = readFileSync(f, 'utf8');
    for (const [index, line] of txt.split('\n').entries()) {
      // 한 줄에 여러 개가 있을 수 있다(클래스 문자열이 길어 줄이 잘 안 나뉜다) —
      // match() 로 첫 건만 보면 나머지가 보고에서 빠진다.
      for (const m of line.matchAll(/text-\[var\((--font-size-[a-zA-Z0-9_-]+)\)\]/g)) {
        violations.push(
          `[무효 폰트 크기 클래스] ${f}:${index + 1}: text-[var(${m[1]})] — ` +
            `Tailwind v4 가 색상으로 해석해 크기가 안 걸린다. text-[length:var(${m[1]})] 로 쓸 것`,
        );
      }
    }
  }
}

/* ── CSS 파일 목록 + 주석 제거 (아래 두 검사 공용) ─────────────────── */
function eachCssFile(fn) {
  // 게이트는 fail-closed 여야 한다. 목록을 못 만들거나 파일이 0개면 조용히
  // 통과시키지 않고 위반으로 올린다 — 검사를 못 돌린 것과 위반이 없는 것은 다르다.
  let list;
  try {
    list = execSync('find src -name "*.css"', { encoding: 'utf8' });
  } catch (e) {
    violations.push(`[게이트 실행 실패] CSS 목록을 만들 수 없다 (${e.message}). 검사를 건너뛰지 않는다`);
    return;
  }
  const files = list.split('\n').filter(Boolean);
  if (!files.length) {
    violations.push('[게이트 실행 실패] src 아래 CSS 파일이 0개다 — 실행 위치나 경로가 바뀐 것으로 본다');
    return;
  }
  for (const f of files) {
    // 주석 안의 예시 값(문서용)을 위반으로 세지 않도록 공백으로 치환한다
    fn(f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' '));
  }
}

/* ── 4) 간격 4px 격자 검사 ─────────────────────────────────────────
 * gap / padding / margin 은 4의 배수만 쓴다. 예외는 1~3px 광학 보정 하나뿐이다
 * (아이콘 baseline 정렬 등 — tokens.css 의 SPACING 절 참조).
 * 이 게이트가 없으면 격자는 조용히 무너진다: 2026-08-26 에 전 CSS 를 격자로
 * 맞춘 그 날, 병행 작업이 10px·14px·6px 을 4건 다시 들여왔다.
 * ────────────────────────────────────────────────────────────────── */
function checkSpacingGrid() {
  // logical property(padding-inline / margin-block-start 등)까지 포함한다.
  const PROP =
    /(?:^|[;{}\s])((?:row-|column-)?gap|padding|margin)(-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?\s*:\s*([^;{}]+)/g;
  eachCssFile((f, txt) => {
    for (const m of txt.matchAll(PROP)) {
      const prop = m[1] + (m[2] || '');
      const value = m[3].trim();
      // 값을 공백으로 쪼개지 않고 px 토큰을 통째로 훑는다. 그래야
      //   음수(-10px) · 함수 인자(max(10px, 2vw)) · var() fallback(var(--x, 10px))
      // 이 전부 걸린다. var(--spacing-3) 처럼 px 가 없는 값은 자연히 통과한다.
      //
      // 단위를 px 로 한정한 것은 의도다. em/rem 간격(리치텍스트의
      // `margin: 0.75em 0` 등)은 글자 크기에 비례하는 흐름 여백이라 4px 격자와
      // 개념이 다르다 — 격자로 강제하면 본문 리듬이 깨진다. radius 쪽은 반대로
      // 단위를 넓게 잡는다(그쪽은 "토큰만 쓴다" 가 규칙이라 단위 교체가 곧 우회다).
      for (const px of value.matchAll(/(-?[\d.]+)px/g)) {
        const signed = parseFloat(px[1]);
        const n = Math.abs(signed); // 음수 마진도 격자를 지켜야 한다
        if (!n || n <= 3) continue; // 0 과 광학 보정(±1~3px)은 허용
        if (n % 4 !== 0) {
          const snapped = (signed < 0 ? -1 : 1) * (Math.round(n / 4) * 4);
          violations.push(
            `[간격 격자 이탈] ${f}: ${prop}: ${value} — ${signed}px 는 4의 배수가 아니다. ` +
              `${snapped}px 로 맞추거나, 정렬 보정이면 3px 이하로 줄일 것`,
          );
        }
      }
    }
  });
}

/* ── 5) radius 리터럴 금지 ─────────────────────────────────────────
 * border-radius 는 tokens.css 의 역할 토큰만 쓴다(chip/control/field/
 * container/hero/pill/circle/tight). px 를 직접 적으면 21종으로 분화됐던
 * 그 상태로 되돌아간다.
 * ────────────────────────────────────────────────────────────────── */
function checkRadiusLiteral() {
  eachCssFile((f, txt) => {
    // shorthand 만 보면 코너별 longhand(border-top-left-radius,
    // border-start-start-radius …)로 그대로 우회된다. 실제로 6건이 그렇게 남아
    // 있었다. 속성 이름을 넓게 잡고 위반 메시지에 실제 속성명을 싣는다.
    for (const m of txt.matchAll(/(border-(?:[a-z]+-)*radius)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1];
      const value = m[2].trim();
      // 단위를 열거하지 않는다. 열거하면 목록에 없는 단위(vmin/vmax, 신규
      // viewport 단위 dvh·svw·lvh, lh/cap/ic …)로 바꾸는 것만으로 우회되고,
      // CSS 에 단위가 추가될 때마다 게이트가 뒤처진다.
      //
      // 대신 반대로 본다: 이 속성에 허용된 것은 토큰 참조와 0 / 100% 뿐이므로,
      // **토큰 참조를 걷어낸 뒤 숫자가 남아 있으면 리터럴**이다.
      // var( 와 토큰 이름만 지우고 닫는 괄호 안쪽은 남기는 게 핵심 — 그래야
      // var(--x, 12px) 의 fallback 이 계속 검사 대상으로 남는다.
      // 정당한 참조는 --radius-* 하나뿐이다. 아무 변수나 통과시키면
      // `border-radius: var(--font-size-body)` 같은 것으로 우회할 수 있고,
      // 되살아난 --card-radius 처럼 폐기한 토큰도 조용히 다시 들어온다.
      const stripped = value.replace(/var\(\s*--radius-[\w-]+/g, ' ');
      for (const other of stripped.matchAll(/var\(\s*(--[\w-]+)/g)) {
        violations.push(
          `[radius 리터럴] ${f}: ${prop}: ${value} — ${other[1]} 는 radius 토큰이 아니다. ` +
            `var(--radius-*) 를 쓸 것 (tight/chip/control/field/container/hero/pill/circle)`,
        );
      }
      for (const lit of stripped.matchAll(/(-?[\d.]+)\s*([a-z%]*)/gi)) {
        const n = parseFloat(lit[1]);
        if (n === 0) continue; // 0 / 0px / 0% — 모서리 없음
        if (lit[2] === '%' && n === 100) continue; // 100% — 컨테이너 전체를 덮는 곡률
        violations.push(
          `[radius 리터럴] ${f}: ${prop}: ${value} — ${lit[1]}${lit[2]} 대신 tokens.css 의 ` +
            `var(--radius-*) 를 쓸 것 (tight/chip/control/field/container/hero/pill/circle)`,
        );
      }
    }
  });
}

/* ── 6) TSX 임의값 간격 검사 ───────────────────────────────────────
 * 4번 검사는 CSS 파일만 본다. 그런데 이 저장소는 Tailwind 유틸도 쓰기 때문에
 * 마크업 쪽으로 격자 밖 값이 그대로 들어올 수 있다 — CSS 를 아무리 격자로
 * 맞춰도 `py-[14px]` 한 줄이면 우회된다.
 *
 * 여기서는 **임의값 대괄호 표기**(`py-[14px]`)만 본다. 스케일 유틸(`gap-1.5`
 * = 6px)까지 한꺼번에 막지 않는 것은 의도다: 그쪽은 800곳 규모라 일괄 스냅이
 * 화면 전반을 바꾸는 결정이고, 게이트는 그 결정을 대신할 수 없다. 임의값은
 * 반대로 "스케일을 벗어나려고 일부러 쓴 표기"라 지금 막는 게 맞다.
 *
 * radius(`rounded-[2px]`)는 포함하지 않는다. 현재 1건뿐이고 그건 축구 카드
 * 아이콘의 모서리라 도메인 형태에 가깝다 — 토큰(4px)으로 올리면 카드 모양이
 * 바뀐다. 늘어나면 그때 별도 판단한다.
 * ────────────────────────────────────────────────────────────────── */
function checkTsxArbitrarySpacing() {
  const SPACING_UTIL = /\b(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-x|space-y)-\[(-?[\d.]+)px\]/g;
  let list;
  try {
    list = execSync('find src \\( -name "*.tsx" -o -name "*.ts" \\)', { encoding: 'utf8' });
  } catch (e) {
    violations.push(`[게이트 실행 실패] TSX 목록을 만들 수 없다 (${e.message}). 검사를 건너뛰지 않는다`);
    return;
  }
  const files = list.split('\n').filter(Boolean);
  if (!files.length) {
    violations.push('[게이트 실행 실패] src 아래 TSX/TS 파일이 0개다 — 실행 위치나 경로가 바뀐 것으로 본다');
    return;
  }
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    for (const [index, line] of txt.split('\n').entries()) {
      for (const m of line.matchAll(SPACING_UTIL)) {
        const n = Math.abs(parseFloat(m[2]));
        if (!n || n <= 3) continue; // 1~3px 광학 보정 — CSS 검사와 같은 예외
        if (n % 4 !== 0) {
          violations.push(
            `[간격 격자 이탈] ${f}:${index + 1}: ${m[0]} — 4의 배수만 쓴다 ` +
              `(1~3px 광학 보정은 예외). 스케일 유틸이나 4의 배수 임의값으로 바꿀 것`,
          );
        }
      }
    }
  }
}

checkHapnida();
checkUndefinedTokens();
checkInertFontSizeClasses();
checkSpacingGrid();
checkRadiusLiteral();
checkTsxArbitrarySpacing();

if (violations.length) {
  console.error(`\n✗ v1 패턴 검사 실패 — ${violations.length}건:\n`);
  for (const v of [...new Set(violations)]) console.error('  ' + v);
  console.error('\n참고: docs/v1-coding-patterns.md\n');
  process.exit(1);
}
console.log(
  '✓ v1 패턴 검사 통과 (합니다체 0, 미정의 CSS 토큰 0, 무효 폰트 크기 클래스 0, 간격 격자 이탈 0(CSS+TSX 임의값), radius 리터럴 0)',
);
