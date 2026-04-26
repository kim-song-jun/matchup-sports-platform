#!/usr/bin/env node
// Apply data-canonical-id="m{NN}-..." attribute to existing DCArtboard tags
// using the mapping built by teameet-build-canonical-id-map.mjs.
// Idempotent — re-running updates existing data-canonical-id values.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const htmlPath = path.join(
  repoRoot,
  'docs/reference/handoff-2026-04-25/sports-platform/project/Teameet Design.html'
);
const mapPath = path.join(repoRoot, 'output/playwright/teameet-canonical-id-map.json');

const html = fs.readFileSync(htmlPath, 'utf8');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const idToCanonical = new Map();
for (const r of map.records) {
  if (r.skipped) continue;
  if (!r.canonicalId) continue;
  idToCanonical.set(r.sourceId, r.canonicalId);
}

let mutated = 0;
let alreadySet = 0;

const updated = html.replace(
  /<DCArtboard\s+id="([^"]+)"\s+label="([^"]+)"\s+width=\{([0-9]+)\}\s+height=\{([0-9]+)\}([^>]*)>/g,
  (full, id, label, w, h, tail) => {
    const canonical = idToCanonical.get(id);
    if (!canonical) return full;
    // strip any existing data-canonical-id (idempotent)
    const cleanedTail = tail.replace(/\s+data-canonical-id="[^"]*"/g, '');
    const expected = ` data-canonical-id="${canonical}"`;
    if (tail.includes(`data-canonical-id="${canonical}"`)) {
      alreadySet++;
      return full;
    }
    mutated++;
    return `<DCArtboard id="${id}" label="${label}" width={${w}} height={${h}}${cleanedTail}${expected}>`;
  }
);

if (mutated > 0) {
  fs.writeFileSync(htmlPath, updated);
}

console.log(JSON.stringify({ mutated, alreadySet, total: idToCanonical.size }, null, 2));
