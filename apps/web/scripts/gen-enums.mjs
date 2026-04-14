#!/usr/bin/env node
// Reads apps/api/prisma/schema.prisma, extracts all enum blocks,
// and writes apps/web/src/types/enums.generated.ts.
// Run with: node scripts/gen-enums.mjs  (from apps/web/)

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dir, '../../api/prisma/schema.prisma');
const outPath = resolve(__dir, '../src/types/enums.generated.ts');

const schema = readFileSync(schemaPath, 'utf8');

// Parse enum blocks: enum Name { value1  value2 ... }
// Values may have inline comments after //
const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;

/** @type {Array<{name: string, values: string[]}>} */
const enums = [];

let match;
while ((match = enumRegex.exec(schema)) !== null) {
  const name = match[1];
  const body = match[2];
  const values = body
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim()) // strip inline comments
    .filter(Boolean); // remove empty lines
  enums.push({ name, values });
}

if (enums.length === 0) {
  console.error('No enums found in schema — check path:', schemaPath);
  process.exit(1);
}

const lines = [
  '// @generated — do not edit. Run pnpm gen:enums to regenerate.',
  '/* eslint-disable */',
  '',
];

for (const { name, values } of enums) {
  const union = values.map((v) => `'${v}'`).join(' | ');
  const arrayLiteral = values.map((v) => `'${v}'`).join(', ');
  lines.push(`export type ${name} = ${union};`);
  lines.push(`export const ${name.toUpperCase()}_VALUES = [${arrayLiteral}] as const;`);
  lines.push('');
}

// Convenience alias: SPORT_TYPES matches the name used across the codebase
lines.push('// Convenience aliases');
lines.push('export const SPORT_TYPES = SPORTTYPE_VALUES;');
lines.push('');

writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Generated ${enums.length} enums → ${outPath}`);
