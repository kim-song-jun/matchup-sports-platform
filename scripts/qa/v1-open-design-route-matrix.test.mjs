import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = 'apps/v1_web/src/app';
const DEFAULT_MATRIX = 'docs/scenarios/13-v1-open-design-recovery-from-zero.md';
const DEFAULT_MANIFEST = 'docs/reference/open-design/teameet-desktop-20260604/manifest.md';
const DEFAULT_REFERENCE = 'docs/reference/open-design/teameet-desktop-20260604/root-html-files.txt';

const STATUS_VALUES = new Set([
  'implemented-well',
  'implemented-partial',
  'visual-only',
  'not-implemented',
  'unsupported-by-v1-contract',
  'blocked-unverified',
]);

const args = parseArgs(process.argv.slice(2));
const matrixPath = args.matrix ?? DEFAULT_MATRIX;
const rows = readMatrixRows(matrixPath);
const activeRows = args.family ? rows.filter((row) => row['route-family'] === args.family) : rows;

if (rows.length === 0) fail(`No matrix rows found in ${matrixPath}`);
if (!args.family && !existsSync(DEFAULT_MANIFEST)) fail(`Missing manifest: ${DEFAULT_MANIFEST}`);
if (args.family && activeRows.length === 0) fail(`No rows found for family ${args.family}`);

if (args['assert-required-columns']) {
  const required = args['assert-required-columns'].split(',').filter(Boolean);
  for (const column of required) {
    if (!(column in rows[0])) fail(`Missing required column: ${column}`);
  }
}

if (args['assert-all-routes'] || args['assert-each-current-route-exactly-one-family']) {
  const currentRoutes = listCurrentRoutes();
  if (args['expected-route-count'] && currentRoutes.length !== Number(args['expected-route-count'])) {
    fail(`Expected ${args['expected-route-count']} routes, found ${currentRoutes.length}`);
  }
  const routeCounts = countBy(rows.filter((row) => row.route !== '(design-only)').map((row) => row.route));
  for (const route of currentRoutes) {
    if (routeCounts.get(route) !== 1) fail(`Route must appear exactly once: ${route}`);
  }
  if (args['assert-each-current-route-exactly-one-family']) {
    const allowed = new Set((args['implementation-families'] ?? '').split(',').filter(Boolean));
    for (const row of rows.filter((item) => item.route !== '(design-only)')) {
      if (!allowed.has(row['route-family'])) fail(`Invalid implementation family for ${row.route}: ${row['route-family']}`);
    }
  }
}

if (args['assert-all-open-design-html']) {
  const referencePath = args['expected-html-count-from-manifest'] ? DEFAULT_REFERENCE : DEFAULT_REFERENCE;
  const htmlFiles = readLines(referencePath);
  const represented = new Set(rows.map((row) => row['open-design-html']).filter(Boolean));
  if (htmlFiles.length !== 109) fail(`Expected 109 Open Design HTML files, found ${htmlFiles.length}`);
  for (const file of htmlFiles) {
    if (!represented.has(file)) fail(`Open Design HTML not represented: ${file}`);
  }
}

if (args['assert-feature-audit-every-row']) {
  const required = [
    'required-page-features',
    'current-v1-feature-evidence',
    'feature-implementation-status',
    'feature-verification-command',
    'feature-evidence-path',
  ];
  for (const [index, row] of activeRows.entries()) {
    for (const column of required) {
      if (!row[column] || row[column] === 'TBD') fail(`Row ${index + 1} missing ${column}`);
    }
  }
}

if (args['assert-feature-status-values']) {
  const allowed = new Set(args['assert-feature-status-values'].split(',').filter(Boolean));
  for (const row of activeRows) {
    const status = row['feature-implementation-status'];
    if (!allowed.has(status)) fail(`Invalid feature status for ${row.route}/${row['open-design-html']}: ${status}`);
  }
}

if (args['disallow-implemented-well-without-evidence'] || args['assert-implemented-well-has-regression-command']) {
  for (const row of activeRows.filter((item) => item['feature-implementation-status'] === 'implemented-well')) {
    if (!row['current-v1-feature-evidence'] || row['current-v1-feature-evidence'] === 'none') {
      fail(`implemented-well without source evidence: ${row.route}/${row['open-design-html']}`);
    }
    if (!row['feature-verification-command'] || row['feature-verification-command'] === 'none') {
      fail(`implemented-well without verification command: ${row.route}/${row['open-design-html']}`);
    }
  }
}

if (args['assert-feature-audit-no-blocked']) {
  const blocked = activeRows.find((row) => row['feature-implementation-status'] === 'blocked-unverified');
  if (blocked) fail(`Blocked feature audit row remains: ${blocked.route}/${blocked['open-design-html']}`);
}

if (args['assert-no-visual-only-fake-success']) {
  for (const row of activeRows.filter((item) => item['feature-implementation-status'] === 'visual-only')) {
    if (row.classification === 'implemented-route') fail(`visual-only implemented route can fake success: ${row.route}`);
  }
}

console.log(JSON.stringify({ status: 'pass', rows: activeRows.length, matrix: matrixPath }, null, 2));

function parseArgs(tokens) {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function readMatrixRows(filePath) {
  if (!existsSync(filePath)) fail(`Missing matrix document: ${filePath}`);
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].startsWith('|') || !/^\|[\s:-]+\|/.test(lines[index + 1])) continue;
    const headers = splitRow(lines[index]).map(normalizeHeader);
    index += 2;
    while (index < lines.length && lines[index].startsWith('|')) {
      const values = splitRow(lines[index]);
      if (values.length === headers.length) rows.push(Object.fromEntries(headers.map((header, itemIndex) => [header, values[itemIndex]])));
      index += 1;
    }
  }
  return rows.filter((row) => row.route && row['open-design-html']);
}

function splitRow(line) {
  return line.slice(1, -1).split('|').map((value) => value.trim().replace(/`/g, ''));
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/\//g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function listCurrentRoutes() {
  const files = [];
  walk(APP_ROOT, files);
  return files.filter((file) => file.endsWith('/page.tsx')).sort().map((file) => {
    const route = file.replace(`${APP_ROOT}`, '').replace('/page.tsx', '');
    return route === '' ? '/' : route;
  });
}

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
}

function readLines(filePath) {
  if (!existsSync(filePath)) fail(`Missing reference file: ${filePath}`);
  return readFileSync(filePath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
