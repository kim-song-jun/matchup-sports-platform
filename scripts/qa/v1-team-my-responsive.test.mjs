import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const teamSource = await readFile('apps/v1_web/src/components/teams/teams-page.tsx', 'utf8');
const mySource = await readFile('apps/v1_web/src/components/my/my-page.tsx', 'utf8');
const myMembersAliasPage = await readFile('apps/v1_web/src/app/my/teams/members/page.tsx', 'utf8');
const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given team and my sources When inspected Then fixed CTA rows use responsive classes', () => {
  assert.ok(teamSource.includes('className="tm-fixed-cta-row tm-fixed-cta-row-weighted"'));
  assert.ok(mySource.includes('className="tm-fixed-cta-row tm-fixed-cta-row-equal"'));
  assert.equal(teamSource.includes("gridTemplateColumns: '1fr 2fr'"), false);
  assert.equal(mySource.includes("gridTemplateColumns: '1fr 1fr'"), false);
});

test('Given utility CSS When inspected Then member/action rows can wrap on narrow screens', () => {
  assert.match(css, /\.tm-fixed-cta-row-equal\s*{/);
  assert.match(css, /\.tm-member-actions\s*{/);
  assert.match(css, /flex-wrap:\s*wrap/);
  assert.match(css, /\.tm-member-actions\s+\.tm-btn\s*{/);
});

test('Given the my team members alias route When inspected Then it renders stable v1 UI instead of a redirect shell', () => {
  assert.match(myMembersAliasPage, /import \{ MyTeamsPageClient \} from '@\/components\/my\/my-api-clients'/);
  assert.match(myMembersAliasPage, /return <MyTeamsPageClient \/>/);
  assert.doesNotMatch(myMembersAliasPage, /redirect\(/);
});
