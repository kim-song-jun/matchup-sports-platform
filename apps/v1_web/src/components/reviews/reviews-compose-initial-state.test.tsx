import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewSourcePageView } from './reviews-page';
import type { ReviewSourcePageModel, ReviewTargetDraft } from './reviews.types';

// AppChrome 이 라우팅 훅을 쓴다 — 다른 화면 테스트와 같은 모킹을 쓴다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews/tournament_fixture/fixture-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// AppChrome 이 알림 벨을 렌더하며 react-query 를 쓴다 — 다른 화면 테스트와 같은 래퍼를 쓴다.
function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeModel(): ReviewSourcePageModel {
  return {
    source: {
      sourceType: 'tournament_fixture',
      sourceId: 'fixture-1',
      title: '조별 1라운드 1경기',
      completedAt: '2026-08-12T08:34:00.000Z',
    },
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
}

function renderSource(
  model: ReviewSourcePageModel,
  drafts: Record<string, ReviewTargetDraft> = {},
  overrides: Partial<Parameters<typeof ReviewSourcePageView>[0]> = {},
) {
  return render(
    <ReviewSourcePageView
      drafts={drafts}
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
      {...overrides}
    />,
  );
}

/**
 * 서버 계약(`SubmitReviewDto` 의 `@ArrayMinSize(1)`)이 별점과 태그를 모두 요구해서 버튼을
 * 풀어줄 수 없으므로, **왜 못 보내는지**가 화면에 남아 있어야 한다.
 */
describe('리뷰 작성 화면 — 보내기 버튼이 잠긴 이유 안내', () => {
  it('아무것도 고르지 않았으면 이유를 적고, 버튼에 그 설명을 묶는다', () => {
    const { container } = renderSource(makeModel());

    const submit = container.querySelector('.tm-fixed-cta button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const hintId = submit.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    // 스크린리더가 읽을 수 있게 실제로 그 id 를 가진 요소가 있어야 한다(허공을 가리키면 안 된다).
    expect(container.querySelector(`#${hintId}`)?.textContent).toMatch(/별점과 태그/);
  });

  it('별점과 태그를 모두 고른 대상이 있으면 안내는 사라지고 버튼이 열린다', () => {
    const model = makeModel();
    // 컴포넌트 내부 `reviewTargetKey()` 와 같은 규칙: 팀 대상은 `team:{teamId}`.
    // 그 규칙이 바뀌면 이 테스트가 깨지는 편이 낫다 — drafts 키가 어긋나면 사용자가 고른
    // 값이 조용히 무시되고 버튼이 영영 안 열린다.
    const key = `team:${model.targets[0].targetTeamId}`;

    const { container } = renderSource(model, { [key]: { rating: 4, tagCodes: ['manner'] } });

    const submit = container.querySelector('.tm-fixed-cta button') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute('aria-describedby')).toBeNull();
    expect(submit).toHaveTextContent('리뷰 1건 보내기');
  });

  it('별점만 고른 대상이 있으면 열지 않고 어느 쪽이 빠졌는지 짚는다', () => {
    const model = makeModel();
    const { container } = renderSource(model, { [`team:${model.targets[0].targetTeamId}`]: { rating: 4, tagCodes: [] } });

    const submit = container.querySelector('.tm-fixed-cta button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(container.querySelector(`#${submit.getAttribute('aria-describedby')}`)?.textContent).toBe('상대팀의 태그를 하나 이상 골라 주세요');
  });
});

/**
 * 별점 버튼은 예전에 "N점" 라벨만 있고 선택 상태가 없어서 스크린리더가 몇 점이 골라졌는지
 * 알 수 없었다. 별 5개를 radiogroup 으로 묶고 선택된 점수 하나만 aria-checked 로 알린다.
 */
describe('리뷰 작성 화면 — 별점은 radiogroup 이다', () => {
  function makeUserModel(): ReviewSourcePageModel {
    const base = makeModel();
    return {
      ...base,
      targets: [
        {
          ...base.targets[0],
          targetType: 'user',
          targetUserId: 'user-1',
          targetTeamId: null,
          name: '김선수',
          subtitle: '풋살 · 미드필더',
        },
      ],
    } as ReviewSourcePageModel;
  }

  function renderView(overrides: { onUpdateRating?: (key: string, rating: number) => void; onUpdateMetricScore?: (key: string, metric: string, score: number) => void } = {}) {
    renderSource(
      makeUserModel(),
      {
        // 세부 4항목을 모두 직접 골라 둔 상태 — 펼친 선수 카드가 5개 그룹을 모두 그린다.
        'user:user-1': { rating: 3, tagCodes: [], metricOverrides: { skill: 4, manner: 2, punctuality: 5, safety: 1 } },
      },
      {
        openKey: 'user:user-1',
        onUpdateMetricScore: overrides.onUpdateMetricScore ?? (() => {}),
        onUpdateRating: overrides.onUpdateRating ?? (() => {}),
      },
    );
  }

  it('총점과 4개 세부 항목이 각자 이름 붙은 radiogroup 이고, 각 그룹에서 고른 점수 하나만 checked 다', () => {
    renderView();

    const expected: Array<[string, string]> = [
      ['김선수 총점', '3점'],
      ['김선수 실력', '4점'],
      ['김선수 매너', '2점'],
      ['김선수 시간약속', '5점'],
      ['김선수 안전', '1점'],
    ];
    for (const [groupName, checkedName] of expected) {
      const group = screen.getByRole('radiogroup', { name: groupName });
      expect(within(group).getAllByRole('radio')).toHaveLength(5);
      const checked = within(group).getAllByRole('radio', { checked: true });
      expect(checked).toHaveLength(1);
      expect(checked[0]).toHaveAccessibleName(checkedName);
    }
  });

  it('선택된 별만 탭 정지점이라 그룹 하나가 탭 한 번으로 지나간다', () => {
    renderView();

    const group = screen.getByRole('radiogroup', { name: '김선수 총점' });
    const tabbable = within(group).getAllByRole('radio').filter((radio) => radio.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName('3점');
  });

  it('오른쪽·왼쪽 화살표가 점수를 바꾸고 포커스가 그 별로 따라간다', async () => {
    const user = userEvent.setup();
    const onUpdateRating = vi.fn();
    renderView({ onUpdateRating });

    const group = screen.getByRole('radiogroup', { name: '김선수 총점' });
    within(group).getByRole('radio', { name: '3점' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onUpdateRating).toHaveBeenLastCalledWith('user:user-1', 4);
    expect(within(group).getByRole('radio', { name: '4점' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    // 부모가 draft 를 바꾸지 않는 이 렌더에서는 checked 는 3점 그대로다 — 방향키는 포커스 별 기준으로 이동한다.
    expect(onUpdateRating).toHaveBeenLastCalledWith('user:user-1', 3);
    expect(within(group).getByRole('radio', { name: '3점' })).toHaveFocus();
  });

  it('양 끝에서는 반대편으로 순환하고, Home·End 는 양 끝으로 간다', async () => {
    const user = userEvent.setup();
    const onUpdateMetricScore = vi.fn();
    renderView({ onUpdateMetricScore });

    const group = screen.getByRole('radiogroup', { name: '김선수 시간약속' });
    within(group).getByRole('radio', { name: '5점' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onUpdateMetricScore).toHaveBeenLastCalledWith('user:user-1', 'punctuality', 1);
    expect(within(group).getByRole('radio', { name: '1점' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(onUpdateMetricScore).toHaveBeenLastCalledWith('user:user-1', 'punctuality', 5);
    expect(within(group).getByRole('radio', { name: '5점' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(onUpdateMetricScore).toHaveBeenLastCalledWith('user:user-1', 'punctuality', 1);
  });

  it('별을 클릭하면 그 점수로 바뀐다', async () => {
    const user = userEvent.setup();
    const onUpdateRating = vi.fn();
    renderView({ onUpdateRating });

    await user.click(within(screen.getByRole('radiogroup', { name: '김선수 총점' })).getByRole('radio', { name: '5점' }));
    expect(onUpdateRating).toHaveBeenCalledWith('user:user-1', 5);
  });
});
