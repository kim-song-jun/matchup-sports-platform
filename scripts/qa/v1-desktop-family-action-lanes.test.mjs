import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');
const mySource = await readFile('apps/v1_web/src/components/my/my-page.tsx', 'utf8');
const myApiSource = await readFile('apps/v1_web/src/components/my/my-api-clients.tsx', 'utf8');
const matchesSource = await readFile('apps/v1_web/src/components/matches/matches-page.tsx', 'utf8');
const reviewsSource = await readFile('apps/v1_web/src/components/reviews/reviews-page.tsx', 'utf8');
const teamsSource = await readFile('apps/v1_web/src/components/teams/teams-page.tsx', 'utf8');
const teamMatchesSource = await readFile('apps/v1_web/src/components/team-matches/team-matches-page.tsx', 'utf8');

function declarationBlockForClass(className) {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|})\\s*[^{}]*\\.${escapedClassName}[^{}]*\\{(?<body>[^{}]*)\\}`, 'm'));
  assert.ok(match?.groups?.body, `Expected a CSS declaration block for .${className}`);
  return match.groups.body;
}

test('Given match/team/team-match detail and filter routes When inspected Then desktop CTAs use constrained action lanes', () => {
  assert.match(matchesSource, /className="tm-fixed-cta tm-match-filter-action"/);
  assert.match(matchesSource, /className="tm-fixed-cta tm-create-fixed-cta tm-match-create-action"/);
  assert.match(matchesSource, /tm-match-joined-desktop-workbench/);
  assert.match(teamMatchesSource, /className="tm-fixed-cta tm-team-match-detail-action"/);
  assert.match(teamMatchesSource, /className="tm-fixed-cta tm-team-match-filter-action"/);
  assert.match(teamMatchesSource, /className="tm-fixed-cta tm-create-fixed-cta tm-team-match-create-action"/);
  assert.match(teamsSource, /className="tm-fixed-cta tm-team-detail-action"/);
  assert.match(teamsSource, /className="tm-fixed-cta tm-team-filter-action"/);
});

test('Given my and review utility routes When inspected Then desktop CTAs use constrained action lanes', () => {
  assert.match(myApiSource, /className="tm-fixed-cta tm-profile-edit-action"/);
  assert.match(myApiSource, /className="tm-fixed-cta tm-location-settings-action"/);
  assert.match(myApiSource, /className="tm-fixed-cta tm-withdrawal-action"/);
  assert.match(reviewsSource, /className="tm-fixed-cta tm-review-compose-action"/);
});

test('Given my management routes When inspected Then they opt into desktop workbench layouts', () => {
  assert.match(mySource, /data-testid="my-matches-open-design"/);
  assert.match(mySource, /tm-my-matches-desktop-workbench/);
  assert.match(mySource, /data-testid="my-teams-open-design"/);
  assert.match(mySource, /tm-my-teams-desktop-workbench/);
  assert.match(mySource, /data-testid="my-team-members-open-design"/);
  assert.match(mySource, /tm-my-team-members-desktop-workbench/);
});

test('Given desktop family action CSS When inspected Then route actions become static and lane-constrained at desktop widths', () => {
  for (const className of [
    'tm-match-filter-action',
    'tm-match-create-action',
    'tm-team-match-filter-action',
    'tm-team-match-create-action',
    'tm-team-filter-action',
    'tm-profile-edit-action',
    'tm-location-settings-action',
    'tm-withdrawal-action',
    'tm-review-compose-action',
  ]) {
    const block = declarationBlockForClass(className);
    assert.match(block, /position:\s*static/);
    assert.match(block, /width:\s*min\(calc\(100% - 56px\),\s*(?:760px|860px|1040px)\)/);
  }

  for (const className of ['tm-team-match-detail-action', 'tm-team-detail-action']) {
    const block = declarationBlockForClass(className);
    assert.match(block, /position:\s*static/);
    assert.match(block, /width:\s*calc\(100% - 56px\)/);
    assert.doesNotMatch(block, /1040px/);
  }
});
