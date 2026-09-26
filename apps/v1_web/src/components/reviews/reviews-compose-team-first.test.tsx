import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewSourcePageView } from './reviews-page';
import type { ReviewSourcePageModel } from './reviews.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews/team_match/tm-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const target = (over: Partial<ReviewSourcePageModel['targets'][number]>) =>
  ({
    targetType: 'user',
    targetUserId: 'u1',
    targetTeamId: null,
    name: '선수1',
    imageUrl: null,
    subtitle: '상대 선수',
    locked: false,
    lockReason: null,
    alreadySubmitted: false,
    review: null,
    reviewerTeam: { teamId: 't1', name: '우리팀', role: 'member' },
    ...over,
  }) as ReviewSourcePageModel['targets'][number];

function model(over: Partial<ReviewSourcePageModel> = {}): ReviewSourcePageModel {
  return {
    source: { title: '우리팀 vs 상대팀', completedAt: '2026-08-18T00:00:00.000Z' },
    sourceMeta: '2026년 8월 18일',
    progressLabel: '작성 0명 · 남은 대상 3명',
    reviewerTeam: { teamId: 't1', name: '우리팀', role: 'member' },
    targets: [
      target({ targetType: 'team', targetUserId: null, targetTeamId: 'opp', name: '상대팀', subtitle: '상대 팀' }),
      target({ targetUserId: 'u1', name: '선수1' }),
      target({ targetUserId: 'u2', name: '선수2' }),
    ],
    ...over,
  } as ReviewSourcePageModel;
}

function renderCompose(m: ReviewSourcePageModel) {
  return render(
    <ReviewSourcePageView
      drafts={{}}
      errorMessage={null}
      loading={false}
      message={null}
      model={m}
      onRetry={vi.fn()}
      onSubmit={vi.fn()}
      onToggleTag={vi.fn()}
      onUpdateMetricScore={vi.fn()}
      onUpdateRating={vi.fn()}
      submitting={false}
    />,
  );
}

describe('후기 작성 화면 — 팀 평가가 기본', () => {
  // 예전엔 팀 1 + 선수 N 을 전부 같은 카드로 깔아 "이 경기의 모든 사람을 평가해야 한다"처럼 읽혔다.
  it('선수 평가는 접힌 채로 시작하고 몇 명인지 알려준다', () => {
    renderCompose(model());

    expect(screen.getByText('상대팀')).toBeInTheDocument();
    const details = screen.getByText(/선수 개별 평가/).closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
  });

  // 이미 쓴 선수 후기가 접혀 있으면 사라진 것처럼 보인다.
  it('이미 작성한 선수가 있으면 펼친 채로 보여준다', () => {
    renderCompose(
      model({
        targets: [
          target({ targetType: 'team', targetUserId: null, targetTeamId: 'opp', name: '상대팀' }),
          target({ targetUserId: 'u1', name: '선수1', alreadySubmitted: true }),
        ],
      }),
    );

    expect(screen.getByText(/선수 개별 평가/).closest('details')).toHaveAttribute('open');
  });

  // 팀 대상이 없으면 선수가 유일한 할 일이라 접어 두면 빈 화면처럼 보인다.
  it('팀 대상이 없으면 선수 목록을 펼쳐 둔다', () => {
    renderCompose(model({ targets: [target({ targetUserId: 'u1', name: '선수1' })] }));

    expect(screen.getByText(/선수 개별 평가/).closest('details')).toHaveAttribute('open');
  });

  // 작성자 팀은 화면 어디에도 "대표로 작성"으로 표기하지 않는다 — 팀원도 팀 후기를 쓴다.
  it('"대표로 작성" 문구를 쓰지 않는다', () => {
    renderCompose(model());

    expect(screen.queryByText(/대표로 작성/)).not.toBeInTheDocument();
  });
});
