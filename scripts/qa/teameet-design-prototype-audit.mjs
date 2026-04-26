// Teameet Prototype Audit (fix28).
// Static pass: grep on lib/screens-*.jsx for token/spacing/typography compliance.
// Runtime pass: Playwright DOM scan for viewport coverage / readiness markers / DOM-side raw-color hits.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const LIB_DIR = path.join(
  PROJECT_ROOT,
  'docs/reference/handoff-2026-04-25/sports-platform/project/lib'
);
const FIX_VERSION = process.env.PROTOTYPE_FIX || 'fix27';
const URL = `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-${FIX_VERSION}`;
const OUT_DIR = path.join(PROJECT_ROOT, 'output/playwright');
const ARTIFACT_PATH = path.join(OUT_DIR, `teameet-design-${FIX_VERSION}-audit.json`);

// Module mapping — file → display name (matches naming in PAGE_READINESS_AUDIT_FIX21.md)
const MODULE_LABEL = {
  'screens-match.jsx': '03 · 개인 매치',
  'screens-team.jsx': '04 · 팀·팀매칭',
  'screens-other.jsx': '08 · 용병 + 기타',
  'screens-more.jsx': '13 · 마이·프로필 + 14 · 결제',
  'screens-sport.jsx': '11 · 종목·실력·안전',
  'screens-deep.jsx': '12 · 커뮤니티·채팅·알림',
  'screens-variants.jsx': '02 · 홈·추천 variants',
  'screens-variants2.jsx': '02 · 홈·추천 variants2',
  'screens-desktop.jsx': '17 · 데스크탑 웹',
  'screens-desktop2.jsx': '17 · 데스크탑 웹 (extra)',
  'screens-upgrade.jsx': '00b~00h · refresh upgrades',
  'screens-my.jsx': '13 · 마이·프로필 (my)',
  'screens-forms.jsx': '19 · 공통 플로우 (forms)',
  'screens-ops.jsx': '18 · 관리자·운영',
  'screens-extras.jsx': '14 · 결제·환불·분쟁 (extras)',
  'screens-hero.jsx': '00 · Toss DNA hero',
  'screens-refresh1.jsx': '00b · onboarding refresh',
  'screens-refresh2.jsx': '00c · home refresh',
  'screens-refresh3.jsx': '00d · detail refresh',
  'screens-v2main.jsx': '00e · main v2',
  'screens-v2main2.jsx': '00f · main v2 (extra)',
  'screens-parity.jsx': '01 · 인증·온보딩 parity',
  'screens-case-matrix.jsx': '00g · case matrix',
  'screens-readiness.jsx': '01-03 · readiness wave',
  'screens-readiness-wave21a.jsx': '09-11 · readiness wave21a',
  'screens-readiness-wave21b.jsx': '12-13 · readiness wave21b',
  'screens-readiness-wave21c.jsx': '14-15 · readiness wave21c',
  'screens-readiness-wave21d.jsx': '16-17 · readiness wave21d',
  'screens-readiness-wave21e.jsx': '18 · readiness wave21e',
  'screens-catalog.jsx': '00j · 화면 카탈로그',
  'screens-system-foundation.jsx': '00k · 디자인 시스템 Foundation',
  'screens-dev-handoff.jsx': '00l · 개발 핸드오프',
  'screens-dev-handoff2.jsx': '00m · 개발 핸드오프 II',
};

// Files that intentionally show raw values (token swatch, system reference).
const DEMO_FILES = new Set([
  'screens-system-foundation.jsx',
  'screens-catalog.jsx',
  'tokens.jsx',
  'signatures.jsx',
]);

// Spacing whitelist (raw px values that are acceptable outside token).
const SPACING_ALLOW = new Set([0, 1, 2]);

// Typography token scale (px) — declared in tokens.jsx --fs-*
const FS_TOKEN_VALUES = new Set([36, 30, 24, 20, 17, 15, 13, 12, 11]);

// Common allowed control sizes (--control-* + chip/button heights)
const CONTROL_HEIGHT_ALLOW = new Set([28, 30, 36, 40, 44, 48, 56, 64, 72]);

const SPACING_PROPS = /\b(padding|margin|gap|top|right|bottom|left|inset|rowGap|columnGap)(?:Top|Right|Bottom|Left|Inline|Block|Start|End|X|Y)?\b/;

async function listJsxFiles() {
  const files = await readdir(LIB_DIR);
  return files.filter((f) => f.startsWith('screens-') && f.endsWith('.jsx')).sort();
}

function stripCommentLines(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith('//')) return false;
      if (t.startsWith('/*') || t.startsWith('*')) return false;
      return true;
    })
    .join('\n');
}

async function staticPass() {
  const files = await listJsxFiles();
  const moduleResults = {};
  const colorTotals = { rawHex: 0, tokenVar: 0 };
  const spacingTotals = { rawNon4: 0, tokenSpace: 0, raw: 0 };
  const typoTotals = { rawFontSize: 0, tmTextClass: 0, fsToken: 0 };

  const allViolations = [];

  for (const file of files) {
    const fullPath = path.join(LIB_DIR, file);
    const raw = await readFile(fullPath, 'utf8');
    const cleaned = stripCommentLines(raw);
    const lines = raw.split('\n');

    const isDemo = DEMO_FILES.has(file);

    // 1. color — color-only tokens (no space/fs/lh/r-/sh/control)
    const hexMatches = cleaned.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    const tokenColorMatches = cleaned.match(/var\(--(?:blue|grey|gray|red|green|orange|yellow|teal|purple|static-(?:white|black)|bg|border|text)[A-Za-z0-9-]*\)/g) || [];
    const tailwindColorMatches = cleaned.match(/(?:bg|text|border|fill|stroke|ring)-(?:blue|gray|grey|red|green|orange|yellow|teal|purple|cyan|sky|emerald|indigo|amber|pink|slate)-(?:50|100|150|200|300|400|500|600|700|800|900)/g) || [];

    const colorRaw = hexMatches.length;
    const colorToken = tokenColorMatches.length + tailwindColorMatches.length;

    // 2. spacing (inline JSX style)
    const spacingMatches = cleaned.match(/\b(?:padding|margin|gap|rowGap|columnGap)(?:Top|Right|Bottom|Left|Inline|Block|Start|End|X|Y)?:\s*['"]?[^,'";\n}]+['"]?/g) || [];
    let spacingRaw = 0;
    let spacingTokenLocal = 0;
    let spacingNon4 = 0;
    for (const sp of spacingMatches) {
      // Pull all numbers from the value
      const nums = (sp.match(/(\d+(?:\.\d+)?)/g) || []).map(Number);
      if (sp.includes('var(--space-')) {
        spacingTokenLocal += nums.length || 1;
        continue;
      }
      // tailwind class p-N is matched separately below
      for (const n of nums) {
        spacingRaw++;
        if (SPACING_ALLOW.has(n)) {
          spacingTokenLocal++;
        } else if (n % 4 === 0) {
          spacingTokenLocal++;
        } else {
          spacingNon4++;
        }
      }
    }
    // Tailwind utility space classes (rough)
    const tailwindSpacing = (cleaned.match(/\bclassName=[^>]*?(?:p|m|gap|space-[xy])-\d+/g) || []).length;
    spacingTokenLocal += tailwindSpacing;

    // 3. typography
    const fontSizeMatches = cleaned.match(/fontSize:\s*['"]?\d+(?:\.\d+)?(?:px|rem)?['"]?/g) || [];
    let fsRaw = 0;
    let fsTokenLocal = 0;
    for (const fs of fontSizeMatches) {
      const num = Number((fs.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
      fsRaw++;
      if (FS_TOKEN_VALUES.has(num)) fsTokenLocal++;
    }
    const tmTextMatches = cleaned.match(/tm-text-(?:display|title|heading|subhead|body-lg|body|label|caption|micro)/g) || [];
    const tailwindFs = (cleaned.match(/\btext-(?:2xs|xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g) || []).length;

    // First-line violations (capture up to 5 raw px spacing examples)
    const localViolations = [];
    if (!isDemo) {
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return;
        const m = line.match(/(padding|margin|gap):\s*['"]?(\d+(?:\.\d+)?)/);
        if (m) {
          const n = Number(m[2]);
          if (!SPACING_ALLOW.has(n) && n % 4 !== 0) {
            localViolations.push({ line: lineNum, category: 'spacing', value: n, snippet: line.trim().slice(0, 100) });
          }
        }
        const fmatch = line.match(/fontSize:\s*['"]?(\d+(?:\.\d+)?)/);
        if (fmatch) {
          const n = Number(fmatch[1]);
          if (!FS_TOKEN_VALUES.has(n)) {
            localViolations.push({ line: lineNum, category: 'typography', value: n, snippet: line.trim().slice(0, 100) });
          }
        }
      });
    }

    moduleResults[file] = {
      module: MODULE_LABEL[file] || file,
      isDemo,
      color: { rawHex: colorRaw, token: colorToken, complianceRate: rate(colorToken, colorRaw + colorToken) },
      spacing: {
        rawValues: spacingRaw,
        nonCompliant: spacingNon4,
        tokenOrCompliant: spacingTokenLocal,
        tailwindUtility: tailwindSpacing,
        complianceRate: rate(spacingTokenLocal, spacingTokenLocal + spacingNon4),
      },
      typography: {
        rawFontSize: fsRaw,
        fsTokenMatch: fsTokenLocal,
        tmTextClass: tmTextMatches.length,
        tailwindFs,
        // Class adoption rate — strict signal: % of typography that uses class instead of inline.
        classAdoptionRate: rate(tmTextMatches.length + tailwindFs, fsRaw + tmTextMatches.length + tailwindFs),
        // Spec compliance rate — % of inline fontSize that matches the fs-token spec values.
        specMatchRate: rate(fsTokenLocal, fsRaw || 1),
        // Combined compliance — class-or-spec-aligned over total typography mentions.
        complianceRate: rate(fsTokenLocal + tmTextMatches.length + tailwindFs, fsRaw + tmTextMatches.length + tailwindFs),
      },
      violationsSample: localViolations.slice(0, 5),
      violationCount: localViolations.length,
    };

    if (!isDemo) {
      colorTotals.rawHex += colorRaw;
      colorTotals.tokenVar += colorToken;
      spacingTotals.raw += spacingRaw;
      spacingTotals.rawNon4 += spacingNon4;
      spacingTotals.tokenSpace += spacingTokenLocal;
      typoTotals.rawFontSize += fsRaw;
      typoTotals.fsToken += fsTokenLocal;
      typoTotals.tmTextClass += tmTextMatches.length;

      for (const v of localViolations) {
        allViolations.push({ file, ...v });
      }
    }
  }

  return {
    moduleResults,
    colorTotals,
    spacingTotals,
    typoTotals,
    allViolations,
  };
}

function rate(numerator, denominator) {
  if (!denominator) return 1;
  return Number((numerator / denominator).toFixed(4));
}

async function runtimePass() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleEvents = [];
  const pageErrors = [];
  page.on('console', (msg) => consoleEvents.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-dc-section]').length > 20, { timeout: 60000 });
  await page.waitForTimeout(2500);

  const dom = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-dc-section]'));
    const sectionData = sections.map((sec) => {
      const id = sec.getAttribute('data-dc-section');
      const slots = Array.from(sec.querySelectorAll('[data-dc-slot]'));
      const sizes = slots.map((slot) => {
        // .dc-card has the intended width/height inline; offsetWidth ignores parent transforms.
        const card = slot.querySelector('.dc-card');
        const w = card?.offsetWidth || 0;
        const h = card?.offsetHeight || 0;
        return { slot: slot.getAttribute('data-dc-slot'), width: w, height: h };
      });
      return { id, slotCount: slots.length, slots: sizes };
    });

    // raw color hits inside artboard inline-style attributes (DOM side)
    const rawHexInDom = [];
    const tokenHexAllow = new Set(['#3182f6', '#3182F6', '#1B64DA', '#191F28', '#fff', '#FFFFFF', '#ffffff', '#000', '#000000']);
    document.querySelectorAll('[data-dc-slot] [style]').forEach((el) => {
      const style = el.getAttribute('style') || '';
      const matches = style.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      for (const m of matches) {
        if (!tokenHexAllow.has(m)) rawHexInDom.push(m);
      }
    });

    // bottom-nav consistency check on mobile boards (375 wide)
    const navMatches = Array.from(document.querySelectorAll('[data-dc-slot]')).map((slot) => {
      const tabs = slot.querySelectorAll('button, [role="button"]');
      // heuristic — find labels matching canonical tab set
      const labels = Array.from(tabs).map((t) => t.textContent?.trim() || '').filter(Boolean);
      return { slot: slot.getAttribute('data-dc-slot'), tabLabels: labels };
    });

    const tmBtn = document.querySelectorAll('.tm-btn').length;
    const tmChip = document.querySelectorAll('.tm-chip').length;
    const tmPressable = document.querySelectorAll('.tm-pressable').length;
    const tmAdminSidebar = document.querySelectorAll('.tm-admin-sidebar').length;
    const totalArtboards = document.querySelectorAll('[data-dc-slot]').length;

    return {
      sectionData,
      rawHexInDom: rawHexInDom.slice(0, 200),
      rawHexInDomCount: rawHexInDom.length,
      navMatchesCount: navMatches.length,
      tmBtn,
      tmChip,
      tmPressable,
      tmAdminSidebar,
      totalArtboards,
    };
  });

  await browser.close();
  return { dom, pageErrors, consoleEvents };
}

function classifyViewport(width) {
  if (!width) return 'unknown';
  if (width < 480) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function buildViewportCoverage(sectionData) {
  const sectionsCoverage = {};
  for (const sec of sectionData) {
    const counts = { mobile: 0, tablet: 0, desktop: 0, unknown: 0 };
    for (const slot of sec.slots) {
      counts[classifyViewport(slot.width)]++;
    }
    sectionsCoverage[sec.id] = {
      slotCount: sec.slotCount,
      ...counts,
      hasMobile: counts.mobile > 0,
      hasTablet: counts.tablet > 0,
      hasDesktop: counts.desktop > 0,
    };
  }
  return sectionsCoverage;
}

function summarize(staticResult, runtime) {
  const { colorTotals, spacingTotals, typoTotals } = staticResult;
  const colorRate = rate(colorTotals.tokenVar, colorTotals.tokenVar + colorTotals.rawHex);
  const spacingRate = rate(spacingTotals.tokenSpace, spacingTotals.tokenSpace + spacingTotals.rawNon4);
  // Typography compliance: weighted — fs token + tm-text + tailwind text-* count as compliant.
  // Raw fontSize is counted as raw; tm-text class adoption per file is the real signal.
  const typoTokenAdoption = typoTotals.fsToken + typoTotals.tmTextClass;
  const typoRate = rate(typoTokenAdoption, typoTokenAdoption + typoTotals.rawFontSize);

  return {
    color: {
      tokenHits: colorTotals.tokenVar,
      rawHexHits: colorTotals.rawHex,
      complianceRate: colorRate,
      gate: colorRate >= 0.98 ? 'pass' : colorRate >= 0.95 ? 'conditional' : 'fail',
    },
    spacing: {
      compliantHits: spacingTotals.tokenSpace,
      rawNonMultiple4: spacingTotals.rawNon4,
      complianceRate: spacingRate,
      gate: spacingRate >= 0.95 ? 'pass' : spacingRate >= 0.9 ? 'conditional' : 'fail',
    },
    typography: {
      tmTextClass: typoTotals.tmTextClass,
      rawFontSize: typoTotals.rawFontSize,
      fsTokenValueMatches: typoTotals.fsToken,
      complianceRate: typoRate,
      gate: typoRate >= 0.97 ? 'pass' : typoRate >= 0.92 ? 'conditional' : 'fail',
    },
    runtime: {
      tmBtn: runtime.dom.tmBtn,
      tmChip: runtime.dom.tmChip,
      tmPressable: runtime.dom.tmPressable,
      tmAdminSidebar: runtime.dom.tmAdminSidebar,
      totalArtboards: runtime.dom.totalArtboards,
      rawHexInDomCount: runtime.dom.rawHexInDomCount,
    },
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const staticResult = await staticPass();
  const runtime = await runtimePass();

  const coverage = buildViewportCoverage(runtime.dom.sectionData);
  const summary = summarize(staticResult, runtime);

  // Module compliance ranking — produce sorted list of weakest modules.
  const moduleEntries = Object.entries(staticResult.moduleResults)
    .filter(([, r]) => !r.isDemo)
    .map(([file, r]) => ({
      file,
      module: r.module,
      colorRate: r.color.complianceRate,
      spacingRate: r.spacing.complianceRate,
      typoRate: r.typography.complianceRate,
      violations: r.violationCount,
    }))
    .sort((a, b) => a.typoRate - b.typoRate);

  // Section coverage — sections without tablet/desktop variant
  const missingViewports = Object.entries(coverage).filter(([id, c]) => !c.hasMobile || !c.hasTablet || !c.hasDesktop);

  const artifact = {
    generatedAt: new Date().toISOString(),
    url: URL,
    summary,
    moduleResults: staticResult.moduleResults,
    moduleRanking: moduleEntries,
    viewportCoverage: coverage,
    missingViewports: missingViewports.map(([id, c]) => ({ section: id, ...c })),
    runtimePass: {
      pageErrors: runtime.pageErrors,
      consoleErrors: runtime.consoleEvents.filter((e) => e.type === 'error'),
      tmBtn: runtime.dom.tmBtn,
      tmChip: runtime.dom.tmChip,
      tmPressable: runtime.dom.tmPressable,
      tmAdminSidebar: runtime.dom.tmAdminSidebar,
      totalArtboards: runtime.dom.totalArtboards,
      rawHexInDom: runtime.dom.rawHexInDom,
      rawHexInDomCount: runtime.dom.rawHexInDomCount,
    },
    violationsSample: staticResult.allViolations.slice(0, 100),
    totalViolations: staticResult.allViolations.length,
  };

  await writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

  // Print compact summary
  const compact = {
    sections: runtime.dom.sectionData.length,
    artboards: runtime.dom.totalArtboards,
    color: summary.color,
    spacing: summary.spacing,
    typography: summary.typography,
    moduleRankingTop3Weakest: moduleEntries.slice(0, 3),
    sectionsMissingTablet: Object.values(coverage).filter((c) => !c.hasTablet).length,
    sectionsMissingDesktop: Object.values(coverage).filter((c) => !c.hasDesktop).length,
    sectionsMissingMobile: Object.values(coverage).filter((c) => !c.hasMobile).length,
    rawHexInDom: runtime.dom.rawHexInDomCount,
    totalViolations: staticResult.allViolations.length,
    artifact: ARTIFACT_PATH,
  };
  console.log(JSON.stringify(compact, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
