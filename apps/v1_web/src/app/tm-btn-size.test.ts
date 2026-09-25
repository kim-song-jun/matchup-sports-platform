import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `.tm-btn` sets no height or padding — only a size modifier does. A button without one renders at
 * text height (24px on alpha, below the 44px touch target) and, as a block, flush against its text.
 */
const SRC = resolve(process.cwd(), 'src');
// tm-inline-action: text-height action inside a sentence, with a 44px hit area of its own.
const SIZE = /tm-btn-(sm|md|lg|icon)\b|(?<![\w-])tm-inline-action(?![\w-])|sizeClass/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function unsizedButtons(): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      const value = match[1] ?? match[2] ?? match[3] ?? '';
      if (/(?<![\w-])tm-btn(?![\w-])/.test(value) && !SIZE.test(value)) {
        hits.push(`${rel}:${text.slice(0, match.index).split('\n').length}`);
      }
    }
  }
  return hits;
}

describe('tm-btn size modifier', () => {
  it('every tm-btn class list carries a size modifier', () => {
    expect(unsizedButtons()).toEqual([]);
  });
});
