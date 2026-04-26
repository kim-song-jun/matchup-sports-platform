// Teameet prototype token sweep — fix31.
// Safely replaces raw #hex literals with var(--token) in lib/screens-*.jsx
// Skips: tokens.jsx (definition source), comments, sport-color fixtures (intentional raw).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LIB_DIR = path.join(
  process.cwd(),
  'docs/reference/handoff-2026-04-25/sports-platform/project/lib'
);

// hex → token map. Lower-case keys; matched case-insensitive.
const HEX_TO_TOKEN = {
  '#ffffff': 'var(--static-white)',
  '#fff': 'var(--static-white)',
  '#000000': 'var(--static-black)',
  '#000': 'var(--static-black)',
  '#3182f6': 'var(--blue500)',
  '#1b64da': 'var(--blue700)',
  '#2272eb': 'var(--blue600)',
  '#4792f7': 'var(--blue400)',
  '#a8cdff': 'var(--blue200)',
  '#d6e7ff': 'var(--blue100)',
  '#e8f3ff': 'var(--blue50)',
  '#f9fafb': 'var(--grey50)',
  '#f2f4f6': 'var(--grey100)',
  '#eaedf0': 'var(--grey150)',
  '#e5e8eb': 'var(--grey200)',
  '#d1d6db': 'var(--grey300)',
  '#b0b8c1': 'var(--grey400)',
  '#8b95a1': 'var(--grey500)',
  '#6b7684': 'var(--grey600)',
  '#4e5968': 'var(--grey700)',
  '#333d4b': 'var(--grey800)',
  '#191f28': 'var(--grey900)',
  '#f04452': 'var(--red500)',
  '#feebec': 'var(--red50)',
  '#03b26c': 'var(--green500)',
  '#e3f8ef': 'var(--green50)',
  '#fe9800': 'var(--orange500)',
  '#fff3e0': 'var(--orange50)',
};

// Skip these files (definition / demo source / data fixtures with intentional raw values).
const SKIP = new Set([
  'tokens.jsx',
  'signatures.jsx',
  'data.jsx',
  'design-canvas.jsx',
]);

// Lines that should never be touched (e.g., explicit "raw exception" comments,
// sport color palette fixtures, social brand colors like Kakao #FEE500).
function isSkipLine(line) {
  const t = line.trim();
  if (t.startsWith('//')) return true;
  if (t.startsWith('*') || t.startsWith('/*')) return true;
  // social brand colors — keep raw
  if (/#FEE500|#03C75A|#191919/i.test(line)) return true;
  // sport color fixture rows
  if (/sport.*color|color:\s*['"]#[0-9a-f]{3,6}['"],/i.test(line) && /id:.*futsal|basketball|soccer|tennis|hockey|badminton|baseball|volleyball|tabletennis|golf|squash/i.test(line)) return true;
  return false;
}

let totalReplacements = 0;
const perFile = {};

async function sweep(file) {
  const fp = path.join(LIB_DIR, file);
  const text = await readFile(fp, 'utf8');
  const lines = text.split('\n');
  let fileReplacements = 0;

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    if (isSkipLine(original)) continue;
    let line = original;
    for (const [hex, token] of Object.entries(HEX_TO_TOKEN)) {
      const re = new RegExp(hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const before = line;
      line = line.replace(re, token);
      const c = (before.match(re) || []).length;
      fileReplacements += c;
    }
    if (line !== original) lines[i] = line;
  }

  if (fileReplacements > 0) {
    await writeFile(fp, lines.join('\n'));
    perFile[file] = fileReplacements;
    totalReplacements += fileReplacements;
  }
}

async function main() {
  const files = await readdir(LIB_DIR);
  for (const f of files) {
    if (!f.endsWith('.jsx')) continue;
    if (SKIP.has(f)) continue;
    await sweep(f);
  }
  console.log(JSON.stringify({ totalReplacements, perFile }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
