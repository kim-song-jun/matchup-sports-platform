import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { threeTeamBracketThird } from './three-team-bracket';

function fixture(overrides: Partial<V1TournamentFixture> & { score?: [number, number]; pens?: [number, number] }): V1TournamentFixture {
  const { score = [1, 0], pens, ...rest } = overrides;
  return {
    id: 'f', groupId: 'g', round: '준결승', fixtureNumber: 1, legNumber: 1, scheduledAt: null, venue: null,
    status: 'completed', liveStatus: 'ended',
    homeRegistrationId: 'h', homeTeamId: 'h', homeTeamName: '2위팀', homeTeamLogoUrl: null,
    awayRegistrationId: 'a', awayTeamId: 'a', awayTeamName: '3위팀', awayTeamLogoUrl: null,
    homeSlotLabel: null, awaySlotLabel: null, videos: [],
    result: { homeScore: score[0], awayScore: score[1], hasPenalty: pens !== undefined, homePenaltyScore: pens?.[0] ?? null,
      awayPenaltyScore: pens?.[1] ?? null, note: null, recordedAt: '2026-11-13T00:00:00Z', goals: [] },
    ...rest,
  } as V1TournamentFixture;
}
const final = fixture({ round: '결승', homeTeamName: '1위팀', awayTeamName: '준결승 승자' });

describe('threeTeamBracketThird', () => {
  it('결승 이전 경기가 하나뿐인 3팀 대진은 준결승에서 진 팀이 3위다', () => {
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: fixture({ score: [2, 1] }) }, { phase: 'final', fixture: final }])).toBe('3위팀');
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: fixture({ score: [0, 3] }) }, { phase: 'final', fixture: final }])).toBe('2위팀');
  });

  it('정규 점수가 같으면 승부차기로 가른다', () => {
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: fixture({ score: [1, 1], pens: [3, 4] }) }, { phase: 'final', fixture: final }])).toBe('2위팀');
  });

  it('준결승이 아직 안 끝났거나 승부가 안 갈렸으면 3위를 정하지 않는다', () => {
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: fixture({ status: 'scheduled', result: null }) }, { phase: 'final', fixture: final }])).toBeNull();
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: fixture({ score: [1, 1] }) }, { phase: 'final', fixture: final }])).toBeNull();
  });

  it('4팀 이상 대진과 3·4위전이 있는 대진은 건드리지 않는다', () => {
    const semi = fixture({});
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: semi }, { phase: 'semi', fixture: fixture({ id: 'f2' }) }, { phase: 'final', fixture: final }])).toBeNull();
    expect(threeTeamBracketThird([{ phase: 'semi', fixture: semi }, { phase: 'third_place', fixture: fixture({ id: 't' }) }, { phase: 'final', fixture: final }])).toBeNull();
  });
});
