import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const matchSource = await readFile('apps/v1_web/src/components/matches/matches-page.tsx', 'utf8');
const teamMatchSource = await readFile('apps/v1_web/src/components/team-matches/team-matches-page.tsx', 'utf8');
const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given match and team-match sources When inspected Then fixed CTA rows use shared responsive classes', () => {
  for (const source of [matchSource, teamMatchSource]) {
    assert.match(source, /className="[^"]*\btm-fixed-cta-row\b[^"]*\btm-fixed-cta-row-weighted\b[^"]*"/);
    assert.match(source, /className="[^"]*\btm-fixed-cta-row\b[^"]*\btm-fixed-cta-row-chat\b[^"]*"/);
    assert.equal(source.includes("gridTemplateColumns: '1fr 2fr'"), false);
    assert.equal(source.includes("gridTemplateColumns: showChat ? '104px 1fr' : '1fr'"), false);
  }
});

test('Given global CSS When inspected Then fixed CTA rows collapse safely on narrow screens', () => {
  assert.match(css, /\.tm-fixed-cta-row\s*{/);
  assert.match(css, /\.tm-fixed-cta-row-weighted\s*{/);
  assert.match(css, /\.tm-fixed-cta-row-chat\s*{/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(min-width:\s*361px\)/);
});
