import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewSourcePageView } from './reviews-page';
import { DEFAULT_REVIEW_RATING } from './reviews.types';
import type { ReviewSourcePageModel } from './reviews.types';

// AppChrome 이 라우팅 훅을 쓴다 — 다른 화면 테스트와 같은 모킹을 쓴다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews/tournament_fixture/fixture-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * 아직 손대지 않은 리뷰 대상의 별점 초기값은 **화면에 보이는 별 개수**로 확인해야 한다.
 * 이 값은 한때 4로 네 군데에 각각 적혀 있었다(초기 draft 생성 · 태그 토글 · 제출 ·
 * 렌더 fallback) — 한 곳만 고치면 사용자가 보는 별과 실제로 전송되는 별이 갈린다.
 * 상수 자체를 단언하면(`DEFAULT_REVIEW_RATING === 5`) 그건 구현 되읊기라 그 어긋남을
 * 못 잡으므로, 여기서는 drafts 를 비운 채 렌더해 **fallback 경로가 그리는 별**을 센다.
 */
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
    progressLabel: '작성 0명 · 남은 대상 1명',
    progressStats: [],
  } as unknown as ReviewSourcePageModel;
}

describe('리뷰 작성 화면 — 아직 손대지 않은 대상의 별점 초기값', () => {
  it('별 5개가 채워진 상태로 시작한다', () => {
    const { container } = render(
      <ReviewSourcePageView
        drafts={{}}
        errorMessage={null}
        loading={false}
        message={null}
        model={makeModel()}
        onRetry={() => {}}
        onSubmit={() => {}}
        onToggleTag={() => {}}
        onUpdateMetricScore={() => {}}
        onUpdateRating={() => {}}
        submitting={false}
      />,
    );

    const stars = container.querySelector('.tm-review-stars');
    expect(stars).not.toBeNull();
    // 선택된 점수는 시각(★)만이 아니라 aria-checked 로도 하나만 노출돼야 한다.
    expect(within(stars as HTMLElement).getByRole('radio', { checked: true })).toHaveAccessibleName(`${DEFAULT_REVIEW_RATING}점`);
    // 별 5개가 전부 채워진 상태여야 한다 — 빈 별이 하나라도 남으면 초기값이 5가 아니다.
    expect(stars!.querySelectorAll('[data-active="true"]')).toHaveLength(5);
    expect(stars!.querySelectorAll('[data-active="false"]')).toHaveLength(0);
  });
});

/**
 * 별점이 기본값으로 이미 채워져 있으니, 태그를 안 고른 사용자 눈에는 "다 했는데 버튼만
 * 회색"으로 보인다. 태그 1개 이상은 서버 계약(`SubmitReviewDto` 의 `@ArrayMinSize(1)`)
 * 이라 버튼을 풀어줄 수 없으므로, **왜 못 보내는지**가 화면에 남아 있어야 한다.
 */
describe('리뷰 작성 화면 — 보내기 버튼이 잠긴 이유 안내', () => {
  it('태그를 하나도 고르지 않았으면 이유를 적고, 버튼에 그 설명을 묶는다', () => {
    const { container } = render(
      <ReviewSourcePageView
        drafts={{}}
        errorMessage={null}
        loading={false}
        message={null}
        model={makeModel()}
        onRetry={() => {}}
        onSubmit={() => {}}
        onToggleTag={() => {}}
        onUpdateMetricScore={() => {}}
        onUpdateRating={() => {}}
        submitting={false}
      />,
    );

    const submit = container.querySelector('.tm-fixed-cta button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const hintId = submit.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    // 스크린리더가 읽을 수 있게 실제로 그 id 를 가진 요소가 있어야 한다(허공을 가리키면 안 된다).
    expect(container.querySelector(`#${hintId}`)?.textContent).toMatch(/태그/);
  });

  it('태그를 고른 대상이 하나라도 있으면 안내는 사라지고 버튼이 열린다', () => {
    const model = makeModel();
    // 컴포넌트 내부 `targetKey()` 와 같은 규칙: 팀 대상은 `team:{teamId}`.
    // 그 규칙이 바뀌면 이 테스트가 깨지는 편이 낫다 — drafts 키가 어긋나면 사용자가 고른
    // 태그가 조용히 무시되고 버튼이 영영 안 열린다.
    const key = `team:${model.targets[0].targetTeamId}`;

    const { container } = render(
      <ReviewSourcePageView
        drafts={{ [key]: { rating: DEFAULT_REVIEW_RATING, tagCodes: ['MANNER'] } }}
        errorMessage={null}
        loading={false}
        message={null}
        model={model}
        onRetry={() => {}}
        onSubmit={() => {}}
        onToggleTag={() => {}}
        onUpdateMetricScore={() => {}}
        onUpdateRating={() => {}}
        submitting={false}
      />,
    );

    const submit = container.querySelector('.tm-fixed-cta button') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute('aria-describedby')).toBeNull();
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
    render(
      <ReviewSourcePageView
        drafts={{
          'user:user-1': {
            rating: 3,
            tagCodes: [],
            metricScores: { skill: 4, manner: 2, punctuality: 5, safety: 1 },
          },
        }}
        errorMessage={null}
        loading={false}
        message={null}
        model={makeUserModel()}
        onRetry={() => {}}
        onSubmit={() => {}}
        onToggleTag={() => {}}
        onUpdateMetricScore={overrides.onUpdateMetricScore ?? (() => {})}
        onUpdateRating={overrides.onUpdateRating ?? (() => {})}
        submitting={false}
      />,
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
