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
 *
 * 사용: node scripts/v1-pattern-check.mjs   (apps/v1_web에서)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const violations = [];

/* ── 1) 합니다체 검사 ──────────────────────────────────────────────── */
// 의도적 예외(코드 로직·비-UI): 변경 시 분기 깨지거나 사용자 콘텐츠/주석.
const HAPNIDA_ALLOW = [
  'matches-client.tsx:411', // API 응답 비교 로직 (값 변경 시 분기 깨짐)
  'matches-create-client.tsx', // oldDefaults: localStorage 저장 draft 비교값
  'community.view-model.ts', // mock 채팅 사용자 콘텐츠
  'team-matches.view-model.ts:1', // 공고 제목(유저 작성형 mock)
  'src/test/', // 테스트 fixture
];
function checkHapnida() {
  let out = '';
  try {
    out = execSync(
      `grep -rnE "입니다|습니다|됩니다|랍니다|십니다" src --include="*.tsx" --include="*.ts" || true`,
      { encoding: 'utf8' },
    );
  } catch { /* grep no-match exits 1 */ }
  for (const line of out.split('\n').filter(Boolean)) {
    const loc = line.split(':').slice(0, 2).join(':');
    if (HAPNIDA_ALLOW.some((a) => line.includes(a) || loc.includes(a))) continue;
    // 주석 줄 제외(// 또는 * 로 시작)
    const body = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1).trim();
    if (body.startsWith('//') || body.startsWith('*') || body.startsWith('/*')) continue;
    violations.push(`[합니다체] ${line.trim()} → 해요체로`);
  }
}

/* ── 2) 미정의 CSS 토큰 검사 ───────────────────────────────────────── */
function checkUndefinedTokens() {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const defined = new Set();
  for (const m of css.matchAll(/(?:^|[\s;{])(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);
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

checkHapnida();
checkUndefinedTokens();

if (violations.length) {
  console.error(`\n✗ v1 패턴 검사 실패 — ${violations.length}건:\n`);
  for (const v of [...new Set(violations)]) console.error('  ' + v);
  console.error('\n참고: docs/v1-coding-patterns.md\n');
  process.exit(1);
}
console.log('✓ v1 패턴 검사 통과 (합니다체 0, 미정의 CSS 토큰 0)');
