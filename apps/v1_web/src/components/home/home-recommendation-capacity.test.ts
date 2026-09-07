import { describe, expect, it } from 'vitest';
import type { V1Home } from '@/types/api';
import { toHomeModel } from './home-client-model';
import { getHomeViewModel } from './home.view-model';

const recommendation = {
  matchId: 'match-1',
  title: '평일 저녁 풋살',
  sportName: '풋살',
  regionName: '광진구',
  startsAt: '2026-09-11T11:00:00.000Z',
};

function recommendedCard(homePayload: V1Home) {
  return toHomeModel(homePayload, getHomeViewModel(), () => undefined, 0, null).recommendedMatches[0];
}

describe('홈 추천 매치 인원', () => {
  it('서버가 내려준 실제 참가 인원과 정원을 카드에 유지한다', () => {
    const card = recommendedCard({
      recommendations: [{ ...recommendation, participantCount: 1, capacity: 6 }],
    });

    expect(card.currentParticipants).toBe(1);
    expect(card.maxParticipants).toBe(6);
  });

  it('서버가 인원을 누락하면 0/1 같은 값을 지어내지 않는다', () => {
    const card = recommendedCard({ recommendations: [recommendation] });

    expect(card.currentParticipants).toBeNull();
    expect(card.maxParticipants).toBeNull();
  });
});
