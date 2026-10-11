/**
 * 리뷰 전송 완료 화면 — 대상에는 상대 팀 평가도 섞여 있어 사람 수("명")로 세면 틀린다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1ReviewTarget } from '@/types/api';
import type { ReviewSourcePageModel } from './reviews.types';
import { ReviewSubmitCompleteView } from './reviews-page';

function target(overrides: Partial<V1ReviewTarget> & Pick<V1ReviewTarget, 'name'>): V1ReviewTarget {
  return {
    targetType: 'user',
    targetUserId: overrides.name,
    targetTeamId: null,
    reviewerTeam: null,
    imageUrl: null,
    subtitle: '',
    alreadySubmitted: false,
    review: null,
    locked: false,
    lockReason: null,
    ...overrides,
  };
}

function modelOf(targets: V1ReviewTarget[]): ReviewSourcePageModel {
  return {
    source: { sourceType: 'tournament_fixture', sourceId: 'lm-1', title: '우리팀 vs 상대팀', completedAt: null },
    reviewerTeam: null,
    sourceMeta: '',
    targets,
  };
}

describe('리뷰 전송 완료 화면', () => {
  it('상대 팀 평가 1건과 선수 1명을 보내면 "2건 전송"으로 센다', () => {
    render(
      <ReviewSubmitCompleteView
        model={modelOf([
          target({ name: '상대팀', targetType: 'team', targetUserId: null, targetTeamId: 'opp', alreadySubmitted: true }),
          target({ name: '김선수', alreadySubmitted: true }),
          ...['이', '박', '최', '정', '한'].map((name) => target({ name: `${name}선수` })),
        ])}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText('2건 전송')).toBeInTheDocument();
    expect(screen.getByText('5건 남음')).toBeInTheDocument();
    expect(screen.queryByText(/명/)).toBeNull();
  });

  it('남은 대상이 없으면 남음 배지를 그리지 않는다', () => {
    render(
      <ReviewSubmitCompleteView
        model={modelOf([target({ name: '김선수', alreadySubmitted: true })])}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText('1건 전송')).toBeInTheDocument();
    expect(screen.queryByText(/남음/)).toBeNull();
  });
});
