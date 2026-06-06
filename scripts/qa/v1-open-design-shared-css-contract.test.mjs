import { readFileSync } from 'node:fs';

const css = readFileSync('apps/v1_web/src/app/globals.css', 'utf8');
const requiredTokens = [
  '--v1-open-design-bg',
  '--v1-open-design-surface',
  '--v1-open-design-border',
  '--v1-open-design-radius-card',
  '--v1-desktop-nav-width: 240px',
  '--v1-desktop-content-max: 100vw',
  '--v1-auth-desktop-content-width: 760px',
];
const requiredSelectors = [
  '.tm-page-header',
  '.tm-filter-pill',
  '.tm-filter-pill[data-active="true"]',
  '.tm-metric-card',
  '.tm-action-panel',
  '.tm-two-column-layout',
  '.tm-mobile-fixed-cta',
  '.tm-desktop-create-cta',
  '.tm-auth-shell-content',
  'var(--v1-auth-desktop-content-width)',
  'grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr)',
  'grid-template-columns: repeat(3, minmax(0, 1fr))',
  '@media (min-width: 1024px)',
  '@media (max-width: 767px)',
];

for (const token of requiredTokens) {
  assertContains(token, 'token');
}
for (const selector of requiredSelectors) {
  assertContains(selector, 'selector');
}
if (/box-shadow:\s*0\s+20px|box-shadow:\s*0\s+24px|letter-spacing:\s*-[0-9.]+em/.test(css)) {
  fail('Open Design shared CSS contract forbids deep shadows and negative letter spacing');
}

console.log(JSON.stringify({ status: 'pass', tokens: requiredTokens.length, selectors: requiredSelectors.length }, null, 2));

function assertContains(value, kind) {
  if (!css.includes(value)) fail(`Missing ${kind}: ${value}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
