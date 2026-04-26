#!/usr/bin/env node
// Build canonical_id alias map for existing prototype DCArtboards.
// Reads Teameet Design.html, extracts all DCArtboard tags within functional sections (01~19),
// emits a reviewable JSON + Markdown table mapping each canonical artboard id
// to its proposed m{NN}-{viewport}-{kind}[-{state|sub}] schema id.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const htmlPath = path.join(
  repoRoot,
  'docs/reference/handoff-2026-04-25/sports-platform/project/Teameet Design.html'
);
const outDir = path.join(repoRoot, 'output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const html = fs.readFileSync(htmlPath, 'utf8');

// Section id → module number (M01..M19) — from ROUTE_OWNERSHIP_MANIFEST_FIX27.md + section titles.
const SECTION_TO_MODULE = {
  // 00x boards stay as docs (no module)
  'toss-dna': null,
  'refresh-onboarding': '01',
  'refresh-merc': '08',
  'refresh-tourn': '09',
  'refresh-pay': '14',
  'refresh-chat': '12',
  'refresh-desktop': '17',
  'refresh-admin': '18',
  'global-shell': '19',
  'screen-catalog': null,
  'design-system-foundation': '19',
  'dev-handoff': null,
  'dev-handoff-2': null,
  'prototype-audit': null,
  // m{NN}-grid sections — keep separate (handled in Phase B+C)
  'm01-grid': '01',
  'm02-grid': '02',
  'm03-grid': '03',
  'm04-grid': '04',
  'm05-grid': '05',
  'm06-grid': '06',
  'm07-grid': '07',
  'm08-grid': '08',
  'm09-grid': '09',
  'm10-grid': '10',
  'm11-grid': '11',
  'm12-grid': '12',
  'm13-grid': '13',
  'm14-grid': '14',
  'm15-grid': '15',
  'm16-grid': '16',
  'm17-grid': '17',
  'm18-grid': '18',
  'm19-grid': '19',
  // functional sections — primary mapping target
  'auth-onboarding': '01',
  'home-discovery': '02',
  'matches-core': '03',
  'teams-team-matches': '04',
  lessons: '05',
  marketplace: '06',
  venues: '07',
  mercenary: '08',
  tournaments: '09',
  'equipment-rental': '10',
  'sports-level-safety': '11',
  community: '12',
  'my-profile-trust': '13',
  'payments-support': '14',
  'settings-states': '15',
  'public-marketing': '16',
  'desktop-web': '17',
  'admin-ops': '18',
  'common-flows-motion': '19',
};

// Width → viewport
function widthToViewport(width) {
  const w = Number(width) || 0;
  if (w >= 1100) return 'dt';
  if (w >= 700) return 'tb';
  return 'mb';
}

// Heuristic id/label → kind (10 enum)
const KIND_RULES = [
  { kind: 'flow-checkin', test: (s) => /(check-?in|arrival|도착)/i.test(s) },
  { kind: 'flow-evaluate', test: (s) => /(evaluate|평가)/i.test(s) },
  { kind: 'flow-score', test: (s) => /(score|결과 입력|스코어)/i.test(s) },
  { kind: 'flow-checkout', test: (s) => /(checkout|체크아웃)/i.test(s) },
  { kind: 'flow-refund', test: (s) => /(refund|환불)/i.test(s) },
  { kind: 'flow-dispute', test: (s) => /(dispute|분쟁)/i.test(s) },
  { kind: 'flow-payout', test: (s) => /(payout|정산 배치)/i.test(s) },
  { kind: 'flow-bracket', test: (s) => /(bracket|대진표)/i.test(s) },
  { kind: 'flow-feed', test: (s) => /(feed|피드)/i.test(s) },
  { kind: 'flow-notif', test: (s) => /(notif|알림 그룹)/i.test(s) },
  { kind: 'flow-pickup', test: (s) => /(pickup|픽업|반납)/i.test(s) },
  { kind: 'flow-verify', test: (s) => /(verify|인증.*실력|safety)/i.test(s) },
  { kind: 'flow-ticket', test: (s) => /(ticket|수강권|티켓)/i.test(s) },
  { kind: 'flow-order', test: (s) => /(order|주문)/i.test(s) },
  { kind: 'flow-account', test: (s) => /account/i.test(s) },
  { kind: 'flow-terms', test: (s) => /(terms|약관|privacy)/i.test(s) },
  { kind: 'flow-pricing', test: (s) => /pricing|가격/i.test(s) },
  { kind: 'flow-faq', test: (s) => /faq/i.test(s) },
  { kind: 'flow-guide', test: (s) => /guide|가이드/i.test(s) },
  { kind: 'flow-search', test: (s) => /search.*results|매치 검색|탐색/i.test(s) },
  { kind: 'flow-stats', test: (s) => /stats|통계/i.test(s) },
  { kind: 'flow-ops', test: (s) => /ops|운영 도구|운영$/i.test(s) },
  { kind: 'state', test: (s) => /(empty|loading|error|skeleton|disabled|permission|pending|sold-?out|deadline|success)/i.test(s) },
  { kind: 'create', test: (s) => /(new|create|등록|작성|생성)/i.test(s) },
  { kind: 'edit', test: (s) => /(edit|수정|편집)/i.test(s) },
  { kind: 'detail', test: (s) => /(detail|상세|profile|user-|코치 상세|채팅방)/i.test(s) },
  { kind: 'list', test: (s) => /(list|목록|hub|index|results|trend|catalog)/i.test(s) },
  { kind: 'main', test: (s) => /(home|main|landing|dashboard|overview|메인|홈)/i.test(s) },
  { kind: 'components', test: (s) => /(components?|버튼|input|chip|card 패턴|컴포넌트)/i.test(s) },
  { kind: 'assets', test: (s) => /(assets?|tokens?|swatch|폰트|아이콘|색)/i.test(s) },
  { kind: 'motion', test: (s) => /(motion|interaction|마이크로|뱃지 펄스|skeleton 애니|tap|애니메이션)/i.test(s) },
];

// State enum (for state kind sub)
const STATE_RULES = [
  { sub: 'loading', test: (s) => /(loading|skeleton|불러)/i.test(s) },
  { sub: 'empty', test: (s) => /empty|빈|없음/i.test(s) },
  { sub: 'error', test: (s) => /error|실패|에러/i.test(s) },
  { sub: 'permission', test: (s) => /permission|권한|위치/i.test(s) },
  { sub: 'pending', test: (s) => /(pending|대기|진행 중)/i.test(s) },
  { sub: 'success', test: (s) => /success|완료|성공/i.test(s) },
  { sub: 'sold-out', test: (s) => /sold-?out|마감|매진/i.test(s) },
  { sub: 'deadline', test: (s) => /deadline|마감/i.test(s) },
  { sub: 'disabled', test: (s) => /disabled|비활성/i.test(s) },
];

function detectKind(idAndLabel) {
  for (const r of KIND_RULES) if (r.test(idAndLabel)) return r.kind;
  return 'main';
}
function detectState(idAndLabel) {
  for (const r of STATE_RULES) if (r.test(idAndLabel)) return r.sub;
  return null;
}

// Variant / step / named suffix detection (sourceId & label aware).
// Returns a slug like "a", "b", "step1", "welcome", "editorial", "quickaction", or null.
const NAMED_KEYWORDS = [
  ['editorial', /editorial/i],
  ['quickaction', /quick.?action/i],
  ['minimal', /minimal|미니멀/i],
  ['widget', /widget|위젯/i],
  ['fab', /fab/i],
  ['toss', /toss canonical/i],
  ['hero', /hero/i],
  ['signature', /signature|시그니처/i],
  ['kpi', /kpi/i],
  ['weekly', /weekly|주간/i],
  ['recommended', /recommended|추천/i],
  ['featured', /featured/i],
  ['compact', /compact|간결/i],
  ['expanded', /expanded|확장/i],
  ['skeleton', /skeleton/i],
  ['sticky', /sticky/i],
  ['bottomsheet', /bottom.?sheet|바텀시트/i],
  ['toast', /toast|토스트/i],
  ['swipe', /swipe|스와이프/i],
  ['map', /map|지도/i],
  ['timeline', /timeline|타임라인/i],
  ['filter', /filter|필터/i],
  ['hub', /hub/i],
  ['catalog', /catalog|카탈로그/i],
  ['index', /index|인덱스/i],
  ['atlas', /atlas|아틀라스/i],
  ['matrix', /matrix|매트릭스/i],
  ['responsive', /responsive|반응형/i],
  ['copyfit', /copy.?fit|문구.?맞춤/i],
  ['readiness', /readiness|준비도/i],
  ['handoff', /handoff|핸드오프/i],
  ['welcome', /welcome|환영/i],
];

function detectStep(idAndLabel) {
  // matches "Step 1", "Step 2" etc., or trailing digits like "ob-1", "step-2"
  const stepMatch = idAndLabel.match(/step.?([0-9]+)/i);
  if (stepMatch) return `step${stepMatch[1]}`;
  return null;
}

function detectVariantSlug(sourceId, label) {
  // Trailing single letter variant (home-a, home-b)
  const letter = sourceId.match(/-([a-z])$/i);
  if (letter) return letter[1].toLowerCase();
  // Named keyword
  const text = `${sourceId} ${label}`;
  for (const [slug, rx] of NAMED_KEYWORDS) {
    if (rx.test(text)) return slug;
  }
  return null;
}

// Last meaningful slug from sourceId. Strips common module prefixes (m-, tm-, market-,
// team-, teams-, lessons-, lesson-, venue-, venues-, mercenary-, tourn-, ..) and returns
// the trailing word(s) joined with '-'. Used as fallback collision tiebreaker.
const PREFIX_DROP = [
  'matches', 'match', 'm',
  'tm', 'team-matches', 'team-match', 'teams', 'team',
  'lessons', 'lesson',
  'market', 'marketplace', 'listing', 'listings',
  'venues', 'venue',
  'mercenary', 'merc',
  'tourn', 'tournaments', 'tournament',
  'rental', 'rentals',
  'sports', 'sport',
  'public', 'community', 'chat', 'feed',
  'pay', 'payments', 'payment',
  'set', 'settings', 'setting',
  'auth', 'ob', 'onboarding',
  'admin', 'adm',
  'home', 'my',
  'lv', 'safety',
  'global', 'system', 'design',
];
function lastSlug(sourceId) {
  let parts = sourceId.split('-').filter(Boolean);
  // strip leading prefixes greedily
  while (parts.length > 1 && PREFIX_DROP.includes(parts[0].toLowerCase())) {
    parts.shift();
  }
  // collapse trailing words
  return parts.join('-').toLowerCase().slice(0, 24); // cap length
}

// Parse all DCSection blocks and within them all DCArtboard tags.
function parseSections(html) {
  const sections = [];
  const sectionOpenRE = /<DCSection\s+id="([^"]+)"\s+title="([^"]+)"(?:\s+subtitle="([^"]*)")?\s*>/g;
  const matches = [];
  let m;
  while ((m = sectionOpenRE.exec(html)) !== null) {
    matches.push({ id: m[1], title: m[2], subtitle: m[3] || '', start: m.index });
  }
  // Build end indexes by next section start or </DCSection> closest after start.
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const sliceStart = cur.start;
    const sliceEnd = next ? next.start : html.length;
    const slice = html.slice(sliceStart, sliceEnd);
    const closeIdx = slice.lastIndexOf('</DCSection>');
    const body = closeIdx >= 0 ? slice.slice(0, closeIdx) : slice;
    sections.push({ ...cur, body });
  }
  return sections;
}

function parseArtboards(sectionBody) {
  const re =
    /<DCArtboard\s+id="([^"]+)"\s+label="([^"]+)"\s+width=\{([0-9]+)\}\s+height=\{([0-9]+)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(sectionBody)) !== null) {
    out.push({ id: m[1], label: m[2], width: Number(m[3]), height: Number(m[4]) });
  }
  return out;
}

const sections = parseSections(html);
const records = [];
const collisions = new Map(); // canonicalId → list of source ids
const skipReason = new Map();

for (const sec of sections) {
  const moduleNum = SECTION_TO_MODULE[sec.id];
  const isMGrid = /^m\d{2}-grid$/.test(sec.id);
  const artboards = parseArtboards(sec.body);
  if (!moduleNum) {
    for (const ab of artboards) {
      records.push({
        sectionId: sec.id,
        sectionTitle: sec.title,
        sourceId: ab.id,
        label: ab.label,
        width: ab.width,
        height: ab.height,
        viewport: widthToViewport(ab.width),
        canonicalId: null,
        skipped: true,
        skipReason: 'docs/meta section (no module)',
        isMGrid,
      });
    }
    continue;
  }
  if (isMGrid) {
    // m-grid sections already use canonical schema; pass-through (no alias needed)
    for (const ab of artboards) {
      records.push({
        sectionId: sec.id,
        sectionTitle: sec.title,
        sourceId: ab.id,
        label: ab.label,
        width: ab.width,
        height: ab.height,
        viewport: widthToViewport(ab.width),
        canonicalId: ab.id, // already canonical
        skipped: true,
        skipReason: 'already canonical (m-grid)',
        isMGrid,
      });
    }
    continue;
  }
  for (const ab of artboards) {
    const vp = widthToViewport(ab.width);
    const idAndLabel = `${ab.id} ${ab.label}`;
    let kind = detectKind(idAndLabel);
    let canonicalId = `m${moduleNum}-${vp}-${kind}`;
    if (kind === 'state') {
      const sub = detectState(idAndLabel);
      if (sub) canonicalId += `-${sub}`;
    }
    // Add semantic sub-suffix from step/variant/named keyword before fallback numeric -N.
    const step = detectStep(idAndLabel);
    const variant = !step ? detectVariantSlug(ab.id, ab.label) : null;
    if (step && !canonicalId.endsWith(step)) {
      canonicalId += `-${step}`;
    } else if (variant && !canonicalId.endsWith(variant)) {
      canonicalId += `-${variant}`;
    }
    // collision tiebreaker: if same canonical id already used in same module,
    // try appending lastSlug from sourceId. Fall back to prefix-prefixed slug,
    // then to numeric -N.
    const key = canonicalId;
    const existingForKey = records.filter(
      (r) => r.canonicalId === key && !r.skipped
    );
    if (existingForKey.length > 0) {
      const slug = lastSlug(ab.id);
      const candidates = [];
      if (slug) candidates.push(`${key}-${slug}`);
      // include original full sourceId-derived slug for prefix-strip cases (e.g., 'lv-hockey')
      const parts = ab.id.split('-').filter(Boolean);
      if (parts.length > 1 && PREFIX_DROP.includes(parts[0].toLowerCase())) {
        candidates.push(`${key}-${parts[0].toLowerCase()}-${slug}`);
      }
      // include label-derived nominalslug for further disambiguation
      const labelSlug = ab.label
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .split('-')
        .filter(Boolean)
        .slice(-2)
        .join('-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 24);
      if (labelSlug && labelSlug !== slug) candidates.push(`${key}-${labelSlug}`);
      let chosen = null;
      for (const c of candidates) {
        if (c.length > 60) continue;
        if (records.some((r) => r.canonicalId === c && !r.skipped)) continue;
        chosen = c;
        break;
      }
      canonicalId = chosen || `${key}-${existingForKey.length + 1}`;
    }
    records.push({
      sectionId: sec.id,
      sectionTitle: sec.title,
      sourceId: ab.id,
      label: ab.label,
      width: ab.width,
      height: ab.height,
      viewport: vp,
      canonicalId,
      skipped: false,
      isMGrid: false,
    });
    if (!collisions.has(key)) collisions.set(key, []);
    collisions.get(key).push(ab.id);
  }
}

// Stats
const total = records.length;
const skipped = records.filter((r) => r.skipped).length;
const aliased = records.filter((r) => !r.skipped).length;
const byModule = {};
for (const r of records) {
  if (r.skipped) continue;
  const m = r.canonicalId.match(/^m(\d{2})/);
  if (!m) continue;
  byModule[m[1]] = (byModule[m[1]] || 0) + 1;
}
const collisionList = [...collisions.entries()].filter(([, v]) => v.length > 1);

// Emit JSON
const json = {
  generatedAt: new Date().toISOString(),
  htmlPath,
  totals: { total, skipped, aliased, modules: Object.keys(byModule).length },
  byModule,
  collisions: collisionList.map(([k, v]) => ({ canonicalId: k, sourceIds: v })),
  records,
};
const jsonOut = path.join(outDir, 'teameet-canonical-id-map.json');
fs.writeFileSync(jsonOut, JSON.stringify(json, null, 2));

// Emit Markdown
const lines = [];
lines.push('# Canonical ID Alias Map (auto-generated)');
lines.push('');
lines.push(`Generated: ${json.generatedAt}`);
lines.push(`Source: \`${htmlPath}\``);
lines.push('');
lines.push(`- Total artboards in functional sections: **${aliased}**`);
lines.push(`- Skipped (docs/meta + already canonical): ${skipped}`);
lines.push(`- Modules covered: ${Object.keys(byModule).length}`);
lines.push('');
lines.push('## Per-module distribution');
lines.push('');
lines.push('| Module | Count |');
lines.push('|---|---|');
for (const k of Object.keys(byModule).sort()) {
  lines.push(`| M${k} | ${byModule[k]} |`);
}
lines.push('');
lines.push('## Mapping table');
lines.push('');
lines.push('| Section | Source ID | Label | W×H | VP | Canonical ID |');
lines.push('|---|---|---|---|---|---|');
for (const r of records) {
  if (r.skipped) continue;
  lines.push(
    `| ${r.sectionId} | \`${r.sourceId}\` | ${r.label} | ${r.width}×${r.height} | ${r.viewport} | \`${r.canonicalId}\` |`
  );
}
if (collisionList.length > 0) {
  lines.push('');
  lines.push('## Collisions (auto-suffixed with -N)');
  lines.push('');
  for (const [cid, sids] of collisionList) {
    lines.push(`- \`${cid}\`: ${sids.map((s) => `\`${s}\``).join(', ')}`);
  }
}
const mdOut = path.join(outDir, 'teameet-canonical-id-map.md');
fs.writeFileSync(mdOut, lines.join('\n') + '\n');

console.log(JSON.stringify({ jsonOut, mdOut, totals: json.totals, collisions: collisionList.length }, null, 2));
