import { describe, expect, it } from 'vitest';
import { toHomeModel } from './home-client-model';
import { getHomeViewModel } from './home.view-model';
import type { V1Home } from '@/types/api';

const noop = () => {};

function model(home: V1Home) {
  return toHomeModel(home, getHomeViewModel(), noop, 0, null);
}

describe('홈 추천 매치 인원', () => {
  const recommendation = {
    matchId: 'match-1',
    title: '평일 저녁 풋살',
    sportName: '풋살',
    regionName: '광진구',
    startsAt: '2026-09-11T11:00:00.000Z',
  };

  it('서버가 준 참가 인원·정원을 그대로 카드에 싣는다', () => {
    const card = model({
      recommendations: [{ ...recommendation, participantCount: 1, capacity: 6 }],
    }).recommendedMatches[0];

    expect(card.currentParticipants).toBe(1);
    expect(card.maxParticipants).toBe(6);
  });

  it('서버가 인원을 안 주면 0/1 같은 숫자를 지어내지 않는다', () => {
    // 지어낸 0/1 은 잔여 1 ≤ 3 이라 카드마다 "마감 임박"까지 달았다(2026-09-07 프로덕션 제보).
    const card = model({ recommendations: [recommendation] }).recommendedMatches[0];

    expect(card.currentParticipants).toBeNull();
    expect(card.maxParticipants).toBeNull();
  });
});
