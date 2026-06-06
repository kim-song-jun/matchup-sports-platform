import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homeClient = await readFile('apps/v1_web/src/components/home/home-client.tsx', 'utf8');
const matchClient = await readFile('apps/v1_web/src/components/matches/matches-client.tsx', 'utf8');
const teamMatchClient = await readFile('apps/v1_web/src/components/team-matches/team-matches-client.tsx', 'utf8');
const teamClient = await readFile('apps/v1_web/src/components/teams/teams-client.tsx', 'utf8');
const apiHooks = await readFile('apps/v1_web/src/hooks/use-v1-api.ts', 'utf8');

test('Given public home can render signed out When chat rooms are queried Then protected chat API is gated by authenticated viewer state', () => {
  assert.match(apiHooks, /export function useV1ChatRooms\(options\?: QueryOptions\)/);
  assert.match(homeClient, /useV1ChatRooms\(\{\s*enabled:\s*Boolean\(query\.data\?\.viewer\?\.authenticated\)\s*\}\)/);
});

test('Given public match detail renders a guest viewer When eligibility preflight is configured Then protected API waits for an authenticated viewer', () => {
  assert.match(matchClient, /const canQueryEligibility = Boolean\(query\.data && query\.data\.viewer && query\.data\.viewer\.state !== 'guest'\);/);
  assert.match(matchClient, /useV1MatchApplicationEligibility\(matchId, \{ enabled: canQueryEligibility \}\)/);
  assert.match(matchClient, /if \(viewerState === 'guest'\) return '로그인 후 신청';/);
});

test('Given public team-match detail renders a guest viewer When eligibility preflight is configured Then protected API waits for an authenticated viewer', () => {
  assert.match(teamMatchClient, /const canQueryEligibility = Boolean\(query\.data && query\.data\.viewer && query\.data\.viewer\.state !== 'guest' && viewerState !== 'host_team'\);/);
  assert.match(teamMatchClient, /useV1TeamMatchEligibility\(teamMatchId, undefined, \{ enabled: canQueryEligibility \}\)/);
  assert.match(teamMatchClient, /if \(viewerState === 'guest'\) return '로그인 후 신청';/);
});

test('Given public team detail renders a logged-out viewer When join eligibility is configured Then protected API waits for a non login-required viewer', () => {
  assert.match(teamClient, /const canQueryEligibility = Boolean\(query\.data && query\.data\.viewer\.disabledReason !== 'LOGIN_REQUIRED'\);/);
  assert.match(teamClient, /useV1TeamJoinEligibility\(teamId, \{ enabled: canQueryEligibility \}\)/);
  assert.match(teamClient, /if \(team\.viewer\.disabledReason === 'LOGIN_REQUIRED'\) return '로그인 후 가입';/);
});
