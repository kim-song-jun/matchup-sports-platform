/**
 * 경기 후기 작성(Task 180 G10) — 실제 클라이언트(draft·펼침 상태·제출)를 MSW 서버 위에서 밟는다.
 * 별은 비어 있게 시작하고, 선수는 이름 한 줄로 접혀 한 번에 한 명만 펼쳐지며,
 * 별·태그 중 하나만 채운 대상이 있으면 보내기가 잠긴다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1ReviewSourceResponse } from '@/types/api';
import { ReviewSourcePageClient } from './reviews-api-clients';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews/team_match/tm-1',
  useRouter: () => ({ push: vi.fn(), replace: routerReplace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const reviewerTeam = { teamId: 'team-mine', name: '우리팀', role: 'member' as const };
const baseTarget = {
  imageUrl: null,
  alreadySubmitted: false,
  review: null,
  locked: false,
  lockReason: null,
  reviewerTeam,
};

const source: V1ReviewSourceResponse = {
  source: { sourceType: 'team_match', sourceId: 'tm-1', title: '우리팀 vs 상대팀', completedAt: '2026-08-18T00:00:00.000Z' },
  reviewerTeam,
  targets: [
    { ...baseTarget, targetType: 'team', targetUserId: null, targetTeamId: 'opp', name: '상대팀', subtitle: '상대 팀' },
    { ...baseTarget, targetType: 'user', targetUserId: 'u1', targetTeamId: null, name: '김선수', subtitle: '상대 선수' },
    { ...baseTarget, targetType: 'user', targetUserId: 'u2', targetTeamId: null, name: '이선수', subtitle: '상대 선수' },
    { ...baseTarget, targetType: 'user', targetUserId: 'u3', targetTeamId: null, name: '박선수', subtitle: '상대 선수' },
  ],
};

let submitted: Array<Record<string, unknown>>;
let server: ReturnType<typeof setupServer>;

beforeEach(() => {
  submitted = [];
  routerReplace.mockClear();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server = setupServer(
    http.get('*/api/v1/reviews/sources/:sourceType/:sourceId', () =>
      HttpResponse.json({ status: 'success', data: source, timestamp: '2026-08-18T00:00:00.000Z' }),
    ),
    http.post('*/api/v1/reviews', async ({ request }) => {
      submitted.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({
        status: 'success',
        data: { review: { reviewId: 'r1' }, alreadySubmitted: false },
        timestamp: '2026-08-18T00:00:00.000Z',
      });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

async function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewSourcePageClient complete={false} sourceId="tm-1" sourceType="team_match" />
    </QueryClientProvider>,
  );
  await screen.findByRole('radiogroup', { name: '상대팀 총점' });
  return user;
}

const submitButton = () => document.querySelector('.tm-fixed-cta button') as HTMLButtonElement;
const submitHint = () => document.querySelector('.tm-fixed-cta p')?.textContent ?? null;
const playerRow = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const stars = (group: string) => within(screen.getByRole('radiogroup', { name: group }));
// 팀 카드와 펼친 선수 카드에 같은 태그 칩이 있으므로 카드 안에서 찾는다.
const teamCard = () => screen.getByRole('radiogroup', { name: '상대팀 총점' }).closest('.tm-card') as HTMLElement;
const playerCard = (name: string) => playerRow(name).closest('.tm-review-player') as HTMLElement;
const tagIn = (card: HTMLElement, label: string) => within(card).getByRole('button', { name: label });

async function fillTeam(user: ReturnType<typeof userEvent.setup>, score = '4점', label = '매너가 좋아요') {
  await user.click(stars('상대팀 총점').getByRole('radio', { name: score }));
  await user.click(tagIn(teamCard(), label));
}

describe('경기 후기 작성 — 처음 열었을 때', () => {
  it('별은 하나도 채워져 있지 않고, 보내기는 잠겨 있다', async () => {
    await renderPage();

    const team = within(screen.getByRole('radiogroup', { name: '상대팀 총점' }));
    expect(team.queryByRole('radio', { checked: true })).toBeNull();
    expect(team.getAllByRole('radio')).toHaveLength(5);
    expect(submitButton().disabled).toBe(true);
    expect(submitHint()).toBe('별점과 태그를 골라야 리뷰를 보낼 수 있어요');
  });

  it('선수는 모두 접힌 한 줄이고, 선수용 별점은 아직 화면에 없다', async () => {
    await renderPage();

    for (const name of ['김선수', '이선수', '박선수']) {
      expect(playerRow(name)).toHaveAttribute('aria-expanded', 'false');
    }
    // 팀 카드의 총점 그룹 하나뿐 — 선수 10명이면 별 50개가 깔리던 화면이 아니다.
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
  });
});

describe('경기 후기 작성 — 선수는 한 번에 한 명만 펼친다', () => {
  it('다른 선수를 누르면 앞 선수는 접히고, 같은 선수를 다시 누르면 접힌다', async () => {
    const user = await renderPage();

    await user.click(playerRow('김선수'));
    expect(playerRow('김선수')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radiogroup', { name: '김선수 총점' })).toBeInTheDocument();

    await user.click(playerRow('이선수'));
    expect(playerRow('김선수')).toHaveAttribute('aria-expanded', 'false');
    expect(playerRow('이선수')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('radiogroup', { name: '김선수 총점' })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: '이선수 총점' })).toBeInTheDocument();

    await user.click(playerRow('이선수'));
    expect(playerRow('이선수')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup', { name: '이선수 총점' })).toBeNull();
  });

  it('접힌 선수는 고른 별·태그를 한 줄 요약으로 남기고, 펼치면 입력값이 그대로 돌아온다', async () => {
    const user = await renderPage();

    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '5점' }));
    await user.click(tagIn(playerCard('김선수'), '매너가 좋아요'));
    await user.click(tagIn(playerCard('김선수'), '팀워크가 좋아요'));
    await user.click(playerRow('이선수'));

    const summary = playerRow('김선수');
    expect(summary).toHaveTextContent('★5 · 태그 2');
    expect(summary).toHaveTextContent('매너가 좋아요 외 1개');

    await user.click(summary);
    expect(stars('김선수 총점').getByRole('radio', { checked: true })).toHaveAccessibleName('5점');
    expect(tagIn(playerCard('김선수'), '매너가 좋아요')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('경기 후기 작성 — 별과 태그 중 하나만 채우면 보낼 수 없다', () => {
  it('태그만 고르면 별점이 5점으로 채워지지 않고 잠긴 채 무엇이 빠졌는지 알려 준다', async () => {
    const user = await renderPage();

    await user.click(tagIn(teamCard(), '매너가 좋아요'));

    expect(stars('상대팀 총점').queryByRole('radio', { checked: true })).toBeNull();
    expect(submitButton().disabled).toBe(true);
    expect(submitHint()).toBe('상대팀의 별점을 골라 주세요');
  });

  it('팀 후기는 다 썼어도 별점만 고른 선수가 있으면 잠그고, 그 선수를 이름으로 짚는다', async () => {
    const user = await renderPage();
    await fillTeam(user);
    expect(submitButton().disabled).toBe(false);

    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '3점' }));
    await user.click(playerRow('이선수'));

    expect(submitButton().disabled).toBe(true);
    expect(submitHint()).toBe('김선수의 태그를 하나 이상 골라 주세요');
    expect(playerRow('김선수')).toHaveTextContent('태그 필요');
    expect(submitted).toHaveLength(0);
  });

  it('덜 끝난 대상이 여럿이면 첫 이름과 나머지 건수를 알린다', async () => {
    const user = await renderPage();
    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '3점' }));
    await user.click(playerRow('이선수'));
    await user.click(tagIn(playerCard('이선수'), '매너가 좋아요'));

    expect(submitHint()).toBe('김선수 외 1건의 별점·태그가 비어 있어요');
  });

  it('평가 지우기로 풀면 그 선수는 보내지 않는 상태로 돌아가 다시 보낼 수 있다', async () => {
    const user = await renderPage();
    await fillTeam(user);
    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '3점' }));
    expect(submitButton().disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: '이 선수 평가 지우기' }));

    expect(stars('김선수 총점').queryByRole('radio', { checked: true })).toBeNull();
    expect(submitButton().disabled).toBe(false);
    expect(submitButton()).toHaveTextContent('리뷰 1건 보내기');
  });
});

describe('경기 후기 작성 — 작성 현황은 입력 즉시 바뀐다', () => {
  it('상단 배지·선수 목록 배지·현황 카드가 보내기 전에 갱신된다', async () => {
    const user = await renderPage();
    expect(screen.getByText('작성 중 0명')).toBeInTheDocument();
    expect(screen.getByText('작성 중 0명 · 남은 대상 4명')).toBeInTheDocument();
    expect(screen.getByText('0명 작성 중')).toBeInTheDocument();

    await fillTeam(user);
    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '3점' }));

    expect(screen.getByText('작성 중 2명')).toBeInTheDocument();
    expect(screen.getByText('작성 중 2명 · 남은 대상 2명')).toBeInTheDocument();
    expect(screen.getByText('1명 작성 중')).toBeInTheDocument();
    expect(screen.getByText('태그가 빠진 1건은 아직 보낼 수 없어요')).toBeInTheDocument();
  });
});

describe('경기 후기 작성 — 서버로 나가는 값', () => {
  it('고른 대상만 보내고, 누르지 않은 별점은 어디에도 섞이지 않는다', async () => {
    const user = await renderPage();
    await fillTeam(user, '4점');
    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '2점' }));
    await user.click(tagIn(playerCard('김선수'), '시간 약속을 잘 지켜요'));

    await user.click(submitButton());

    await waitFor(() => expect(submitted).toHaveLength(2));
    expect(submitted[0]).toMatchObject({ targetType: 'team', targetTeamId: 'opp', rating: 4, tagCodes: ['manner'] });
    // 팀 대상에 4항목을 실으면 서버가 400 으로 거부한다.
    expect(submitted[0]).not.toHaveProperty('metricScores');
    // 세부 항목을 만지지 않았으므로 종합 별점(2)을 따라간다 — 초기 5점이 아니다.
    expect(submitted[1]).toMatchObject({
      targetType: 'user',
      targetUserId: 'u1',
      rating: 2,
      tagCodes: ['punctual'],
      metricScores: { skill: 2, manner: 2, punctuality: 2, safety: 2 },
    });
    expect(routerReplace).toHaveBeenCalledWith('/my/reviews/team_match/tm-1?complete=1');
  });

  it('세부 항목은 바꾼 것만 따로 나가고 나머지는 종합 별점을 따라간다', async () => {
    const user = await renderPage();
    await user.click(playerRow('김선수'));
    await user.click(stars('김선수 총점').getByRole('radio', { name: '3점' }));
    await user.click(tagIn(playerCard('김선수'), '매너가 좋아요'));

    await user.click(screen.getByRole('button', { name: /바꾸기/ }));
    await user.click(stars('김선수 매너').getByRole('radio', { name: '5점' }));
    // 종합 별점을 바꿔도 손대지 않은 항목은 함께 움직이고, 직접 고른 항목은 그대로다.
    await user.click(stars('김선수 총점').getByRole('radio', { name: '4점' }));

    await user.click(submitButton());

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toMatchObject({
      targetUserId: 'u1',
      rating: 4,
      metricScores: { skill: 4, manner: 5, punctuality: 4, safety: 4 },
    });
  });
});

describe('경기 후기 작성 — 별점 radiogroup 키보드 계약', () => {
  it('아무것도 고르지 않았을 때도 첫 별로 탭해 들어갈 수 있고, 화살표가 점수를 정한다', async () => {
    const user = await renderPage();
    const group = stars('상대팀 총점');

    const tabbable = group.getAllByRole('radio').filter((radio) => radio.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName('1점');

    tabbable[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(group.getByRole('radio', { checked: true })).toHaveAccessibleName('2점');
    expect(group.getByRole('radio', { name: '2점' })).toHaveFocus();
  });
});
