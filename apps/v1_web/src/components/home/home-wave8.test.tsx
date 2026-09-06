import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toHomeModel } from './home-client-model';
import { getHomeViewModel } from './home.view-model';
import { LineupTodoCard } from '@/components/lineup/lineup-todo-card';
import type { V1Home, V1Match } from '@/types/api';

const noop = () => {};

function model(home: V1Home) {
  return toHomeModel(home, getHomeViewModel(), noop, 0, null);
}

describe('홈 통계', () => {
  it('서버가 summary 를 안 주면 목업 숫자가 아니라 빈 값을 보여준다', () => {
    const stats = model({ viewer: { authenticated: true, displayName: '선준', onboardingStatus: 'completed' } }).stats;

    // 목업(home.view-model.ts)의 12경기·+3·8 은 사용자의 기록이 아니다 — 새어 나가면 안 된다.
    expect(stats.monthlyActivity).toBe('-');
    expect(stats.joined).toBe('-');
    expect(stats.monthlyActivitySub).not.toBe('지난달보다 +3');
  });

  it('summary 가 오면 일곱 칸을 모두 그 값에서 만든다 — 목업이 섞이지 않는다', () => {
    const stats = model({
      // trustState 는 서버가 'verified' | 'estimated' 만 의미 있게 내려준다(그 외는 '-').
      summary: { monthlyMatches: 3, mannerScore: 4.2, trustState: 'verified', pendingLabel: '신청 1건' },
    }).stats;

    // 일곱 칸 전부를 단언한다 — 하나라도 빠지면 그 칸에 목업이 남아도 테스트가 통과한다.
    expect(stats).toEqual({
      monthlyActivity: 3,
      monthlyActivitySub: '신청 1건',
      mannerScore: '4.2',
      mannerScoreSub: '인증 완료',
      joined: 3,
      trustState: '인증 완료',
      pending: '신청 1건',
    });
  });
});

describe('홈 추천 카드 사진', () => {
  const match = {
    id: 'match-1',
    title: '토요일 풋살',
    sportName: '풋살',
    placeName: '성수 풋살장',
    startsAt: '2026-09-05T10:00:00.000Z',
    capacityText: '4/10',
  } as unknown as V1Match;

  it('매치에 사진이 없으면 목업 사진을 깔지 않는다', () => {
    const card = model({ recommendedMatches: [match] }).recommendedMatches[0];

    expect(card.imageUrl).toBeNull();
  });

  it('매치가 가진 사진은 그대로 쓴다', () => {
    const card = model({ recommendedMatches: [{ ...match, imageUrl: '/uploads/real.webp' }] }).recommendedMatches[0];

    expect(card.imageUrl).toBe('/uploads/real.webp');
  });
});

vi.mock('@/hooks/use-v1-api', () => ({
  useV1LineupTodos: () => ({ data: undefined, isError: true, refetch: vi.fn() }),
}));

describe('라인업 할 일 카드', () => {
  it('조회가 실패하면 조용히 사라지지 않고 오류와 재시도를 보여준다', () => {
    render(<LineupTodoCard />);

    // 실패를 감추면 "할 일이 없는 것"과 구분되지 않아 경기 당일까지 라인업이 비어 있게 된다.
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했어요');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
  });
});

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
