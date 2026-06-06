import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');
const shell = await readFile('apps/v1_web/src/components/v1-ui/shell.tsx', 'utf8');
const matches = await readFile('apps/v1_web/src/components/matches/matches-page.tsx', 'utf8');
const teamMatches = await readFile('apps/v1_web/src/components/team-matches/team-matches-page.tsx', 'utf8');
const teams = await readFile('apps/v1_web/src/components/teams/teams-page.tsx', 'utf8');

test('Given AppChrome source When inspected Then wide layout is opt-in instead of global', () => {
  assert.match(shell, /wide\?: boolean/);
  assert.match(shell, /wide \? 'tm-app-frame-wide' : ''/);
  assert.match(matches, /<AppChrome[^>]*wide/s);
  assert.match(teamMatches, /<AppChrome[^>]*wide/s);
  assert.match(teams, /<AppChrome[^>]*wide/s);
});

test('Given desktop adaptive CSS When inspected Then tablet widths fill the viewport and keep list stacks linear', () => {
  assert.match(css, /@media \(min-width: 768px\)\s*{[^}]*\.tm-app-frame-wide/s);
  assert.match(css, /\.tm-app-frame-wide\s*{[^}]*--v1-app-chrome-frame-width:\s*100vw/s);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-team-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-teams-desktop-workbench \.tm-team-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test('Given desktop adaptive CSS When inspected Then detail content is constrained and utility shell remains compact by default', () => {
  assert.match(css, /\.tm-app-frame-wide \.tm-match-detail\s*{[^}]*width:\s*min\(100%,\s*var\(--v1-wide-content-lane-max\)\)/s);
  assert.match(css, /\.tm-app-frame-wide \.tm-team-detail-body\s*{[^}]*width:\s*min\(100%,\s*var\(--v1-wide-content-lane-max\)\)/s);
  assert.doesNotMatch(css, /\.tm-app-frame\s*{[^}]*960px/s);
});

test('Given desktop adaptive CSS When inspected Then personal match create and edit forms use a focused lane', () => {
  assert.match(
    css,
    /@media \(min-width: 1024px\)\s*{[\s\S]*\n\s*\.tm-match-create-open-design\s*{[^}]*width:\s*min\(calc\(100% - 56px\),\s*760px\)[^}]*margin-right:\s*auto[^}]*margin-left:\s*auto/s,
  );
});

test('Given desktop adaptive CSS When inspected Then account and team utility forms use focused lanes', () => {
  for (const selector of ['tm-profile-edit-shell', 'tm-settings-open-design', 'tm-team-form-open-design']) {
    assert.match(
      css,
      new RegExp(`\\.${selector}[^{]*\\{[^}]*width:\\s*min\\(calc\\(100% - 56px\\),\\s*760px\\)[^}]*margin-right:\\s*auto[^}]*margin-left:\\s*auto`, 's'),
    );
  }
  assert.match(
    css,
    /\.tm-profile-edit-shell \+ \.tm-fixed-cta \.tm-btn-block,\n\s*\.tm-team-form-open-design \+ \.tm-fixed-cta \.tm-fixed-cta-row\s*{[^}]*width:\s*min\(calc\(100% - 56px\),\s*760px\)[^}]*margin-right:\s*auto[^}]*margin-left:\s*auto/s,
  );
  assert.match(
    css,
    /\.tm-profile-edit-shell \+ \.tm-fixed-cta \.tm-btn-block\s*{[^}]*display:\s*flex[^}]*width:\s*min\(calc\(100% - 56px\),\s*760px\)[^}]*margin-right:\s*auto[^}]*margin-left:\s*auto/s,
  );
});

test('Given desktop adaptive CSS When inspected Then auth pages keep body and CTA inside a full-height content column', () => {
  assert.match(
    css,
    /@media \(min-width: 1024px\)\s*{[\s\S]*\.tm-auth-frame\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /\.tm-auth-fixed-cta\s*{[^}]*left:\s*0[^}]*right:\s*0[^}]*width:\s*auto/s,
  );
});
