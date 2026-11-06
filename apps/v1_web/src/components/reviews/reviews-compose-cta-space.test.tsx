import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewSourcePageView } from './reviews-page';
import type { ReviewSourcePageModel } from './reviews.types';

const model = {
  source: { sourceType: 'tournament_fixture', sourceId: 'fixture-1', title: '조별 1라운드 1경기', completedAt: '2026-08-12T08:34:00.000Z' },
  reviewerTeam: { teamId: 'team-mine', name: '우리팀' },
  targets: [
    {
      targetType: 'team',
      targetUserId: null,
      targetTeamId: 'team-rival',
      reviewerTeam: { teamId: 'team-mine', name: '우리팀' },
      name: '상대팀',
      imageUrl: null,
      subtitle: '대회 상대 팀',
      alreadySubmitted: false,
      review: null,
      locked: false,
      lockReason: null,
    },
  ],
  sourceMeta: '8월 12일 (수) 17:34',
} as unknown as ReviewSourcePageModel;

function renderInScrollArea(admin: boolean) {
  return render(
    <main className="tm-scroll-area">
      <style>{'.tm-fixed-cta { position: fixed; }'}</style>
      <ReviewSourcePageView
        admin={admin}
        drafts={{}}
        errorMessage={null}
        loading={false}
        message={null}
        model={model}
        onClearDraft={() => {}}
        onRetry={() => {}}
        onSubmit={() => {}}
        onToggleOpen={() => {}}
        onToggleTag={() => {}}
        onUpdateMetricScore={() => {}}
        onUpdateRating={() => {}}
        openKey={null}
        submitting={false}
      />
    </main>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('경기 후기 작성 — 하단 고정 보내기 영역이 마지막 줄을 가리지 않는다', () => {
  it('고정된 보내기 영역의 높이를 스크롤 영역에 알려 진행 요약 아래로 그만큼 비운다', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function offsetHeight(this: HTMLElement) {
      return this.classList.contains('tm-fixed-cta') ? 161 : 0;
    });
    renderInScrollArea(false);

    const scrollArea = screen.getByRole('main');
    expect(scrollArea.style.getPropertyValue('--tm-create-cta-height')).toBe('161px');
  });

  it('관리자 화면처럼 버튼이 본문 흐름 안에 있으면 따로 비우지 않는다', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(161);
    renderInScrollArea(true);

    const scrollArea = screen.getByRole('main');
    expect(scrollArea.style.getPropertyValue('--tm-create-cta-height')).toBe('0px');
  });
});
