import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_V1_BASE_URL = 'http://localhost:3013';
export const DEFAULT_OPEN_DESIGN_ROOT = '/Users/sungjun/Library/Application Support/Open Design/namespaces/release-stable/data/projects/dc57a253-6a77-4c01-b76b-6a4d1a9037d7';
// Use V1_QA_AUTH_EMAIL=admin@teameet.v1 for admin route captures.
export const DEFAULT_HOST_EMAIL = process.env.V1_QA_AUTH_EMAIL ?? 'host@teameet.v1';
export const OUTPUT_ROOT = path.join('output', 'playwright', 'visual-audit');

const DEFAULT_VIEWPORTS = '375x812,1280x900';
const FEATURE_COLUMNS = [
  'requiredPageFeatures',
  'currentV1FeatureEvidence',
  'featureImplementationStatus',
  'featureVerificationCommand',
  'featureEvidencePath',
];

export function validateV1BaseUrl(baseUrl) {
  try {
    if (new URL(baseUrl).origin === REQUIRED_V1_BASE_URL) {
      return { ok: true, message: `using ${REQUIRED_V1_BASE_URL}` };
    }
  } catch {
    return { ok: false, message: `v1 Open Design parity requires ${REQUIRED_V1_BASE_URL}; received ${baseUrl}` };
  }
  return { ok: false, message: `v1 Open Design parity requires ${REQUIRED_V1_BASE_URL}; received ${baseUrl}` };
}

export function parsePairs(value) {
  return String(value ?? '').split(',').filter(Boolean).map((item) => {
    const [staticHtml, liveRoute] = item.split(':');
    if (!staticHtml || !liveRoute?.startsWith('/')) throw new Error(`Invalid pair: ${item}`);
    return { staticHtml, liveRoute };
  });
}

export function parseViewports(value = DEFAULT_VIEWPORTS) {
  return String(value).split(',').filter(Boolean).map((item) => {
    const [widthText, heightText] = item.split('x');
    const width = Number(widthText);
    const height = Number(heightText);
    if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error(`Invalid viewport: ${item}`);
    return { name: `${width}x${height}`, width, height };
  });
}

export function buildFeatureAuditReport(rows) {
  const failures = [];
  for (const row of rows.filter((item) => item.classification === 'implemented-route')) {
    for (const column of FEATURE_COLUMNS) {
      if (!row[column] || row[column] === 'TBD' || row[column] === 'none') {
        failures.push(`${row.route} missing ${column}`);
      }
    }
  }
  return { ok: failures.length === 0, checkedRows: rows.length, failures };
}

export function buildPairsFromMatrixRows(rows) {
  return rows
    .filter((row) => row.classification === 'implemented-route' && row.route.startsWith('/'))
    .map((row) => {
      const staticHtml = row.openDesignHtml;
      if (!staticHtml || !staticHtml.endsWith('.html')) throw new Error(`Missing Open Design html for ${row.route}`);
      return { staticHtml, liveRoute: row.route };
    });
}

export function buildReportPlan({ baseUrl, outPath, openDesignRoot, pairs, runId, viewports }) {
  const captures = [];
  for (const pair of pairs) {
    for (const viewport of viewports) {
      const routeSlug = slug(`${pair.liveRoute}__${viewport.name}`);
      captures.push({
        ...pair,
        viewport,
        staticUrl: pathToFileURL(path.join(openDesignRoot, pair.staticHtml)).href,
        liveUrl: new URL(pair.liveRoute, baseUrl).toString(),
        staticScreenshot: path.join(OUTPUT_ROOT, runId, 'static', `${routeSlug}.png`),
        liveScreenshot: path.join(OUTPUT_ROOT, runId, 'live', `${routeSlug}.png`),
      });
    }
  }
  return { baseUrl, outPath, openDesignRoot, runId, captures };
}

export async function readFeatureRows(filePath) {
  const content = await readFile(filePath, 'utf8');
  return readMarkdownRows(content).map((row) => ({
    route: row.route,
    classification: row.classification,
    openDesignHtml: row['open-design-html'],
    requiredPageFeatures: row['required-page-features'],
    currentV1FeatureEvidence: row['current-v1-feature-evidence'],
    featureImplementationStatus: row['feature-implementation-status'],
    featureVerificationCommand: row['feature-verification-command'],
    featureEvidencePath: row['feature-evidence-path'],
  }));
}

export function parseArgs(tokens) {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index].startsWith('--') ? tokens[index].slice(2) : '';
    if (!key) continue;
    const next = tokens[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

export function criteriaSummary() {
  return {
    desktopNavVisible: true,
    bottomNavVisible: false,
    horizontalOverflow: false,
    filterRailVisible: 'recorded',
    cardRhythm: 'recorded',
    ctaContracts: 'no dead .html/file links',
    textClipping: 'none',
  };
}

export function isProtectedRoute(route) {
  const pathname = normalizePathname(route);
  if (['/my', '/chat', '/notifications', '/admin', '/onboarding'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  return pathname === '/matches/new'
    || pathname.startsWith('/matches/new/')
    || /^\/matches\/[^/]+\/edit$/.test(pathname)
    || pathname === '/team-matches/new'
    || pathname.startsWith('/team-matches/new/')
    || /^\/team-matches\/[^/]+\/edit$/.test(pathname)
    || pathname === '/teams/new'
    || /^\/teams\/[^/]+\/(?:edit|members)$/.test(pathname)
    || pathname === '/reviews/new';
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readMarkdownRows(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].startsWith('|') || !/^\|[\s:-]+\|/.test(lines[index + 1])) continue;
    const headers = splitRow(lines[index]).map(normalizeHeader);
    index += 2;
    while (index < lines.length && lines[index].startsWith('|')) {
      const values = splitRow(lines[index]);
      if (values.length === headers.length) {
        rows.push(Object.fromEntries(headers.map((header, itemIndex) => [header, values[itemIndex]])));
      }
      index += 1;
    }
  }
  return rows.filter((row) => row.route);
}

function splitRow(line) {
  return line.slice(1, -1).split('|').map((value) => value.trim().replace(/`/g, ''));
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/\//g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizePathname(route) {
  const pathname = String(route).split('?')[0].replace(/\/$/, '');
  return pathname || '/';
}

function slug(value) {
  return value.replace(/^\//, '').replace(/[^a-z0-9_]+/gi, '_') || 'root';
}
