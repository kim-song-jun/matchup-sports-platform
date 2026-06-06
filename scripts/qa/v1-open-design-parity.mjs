import { pathToFileURL } from 'node:url';

import { capturePlan } from './v1-open-design-parity-browser.mjs';
import {
  DEFAULT_OPEN_DESIGN_ROOT,
  REQUIRED_V1_BASE_URL,
  buildFeatureAuditReport,
  buildPairsFromMatrixRows,
  buildReportPlan,
  parseArgs,
  parsePairs,
  parseViewports,
  readFeatureRows,
  validateV1BaseUrl,
  writeJson,
} from './v1-open-design-parity-lib.mjs';

export {
  buildFeatureAuditReport,
  buildReportPlan,
  parsePairs,
  parseViewports,
  validateV1BaseUrl,
} from './v1-open-design-parity-lib.mjs';

export { capturePlan } from './v1-open-design-parity-browser.mjs';

export const PARITY_CONTRACT_FIELDS = [
  'file://',
  'localhost:3013',
  'staticScreenshot',
  'liveScreenshot',
  'desktopNavVisible',
  'bottomNavVisible',
  'horizontalOverflow',
  'filterRailVisible',
  'cardRhythm',
  'ctaContracts',
  'textClipping',
  'featureAudit',
  'featureImplementationStatus',
  'featureVerificationCommand',
  'dev-login',
  'host@teameet.v1',
];

const DEFAULT_MATRIX = 'docs/scenarios/13-v1-open-design-recovery-from-zero.md';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args['base-url'] ?? process.env.V1_WEB_BASE_URL ?? REQUIRED_V1_BASE_URL;
  const baseCheck = validateV1BaseUrl(baseUrl);
  if (args['assert-v1-base']) {
    if (!baseCheck.ok) fail(baseCheck.message);
    console.log(JSON.stringify(baseCheck, null, 2));
    return;
  }
  if (!baseCheck.ok) fail(baseCheck.message);

  if (args['assert-feature-audit-contract']) {
    const rows = await readFeatureRows(args.matrix ?? DEFAULT_MATRIX);
    const featureAudit = buildFeatureAuditReport(rows);
    await writeJson(args.out ?? 'evidence/task-3-feature-audit-contract.json', { featureAudit });
    if (!featureAudit.ok) fail(`featureAudit contract failed: ${featureAudit.failures.join('; ')}`);
    console.log(JSON.stringify({ status: 'pass', featureAudit }, null, 2));
    return;
  }

  const matrixRows = args.matrix ? await readFeatureRows(args.matrix) : null;
  const pairs = args.pairs
    ? parsePairs(args.pairs)
    : matrixRows
      ? buildPairsFromMatrixRows(matrixRows)
      : parsePairs('home.html:/home');
  const outPath = args.out ?? 'evidence/task-3-open-design-parity.json';
  const plan = buildReportPlan({
    baseUrl,
    outPath,
    openDesignRoot: args['open-design-root'] ?? DEFAULT_OPEN_DESIGN_ROOT,
    pairs,
    runId: process.env.RUN_ID ?? args['run-id'] ?? 'open-design-parity',
    viewports: parseViewports(args.viewports),
  });
  const report = await capturePlan(plan);
  await writeJson(outPath, report);
  const liveFailures = report.captures.filter((capture) => capture.liveCapture?.status !== 'PASS');
  if (liveFailures.length > 0) {
    fail(`live Open Design parity failed: ${liveFailures.length} capture(s) were not PASS`);
  }
  console.log(JSON.stringify({ status: 'pass', out: outPath, captures: report.captures.length, liveFailures: 0 }, null, 2));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
