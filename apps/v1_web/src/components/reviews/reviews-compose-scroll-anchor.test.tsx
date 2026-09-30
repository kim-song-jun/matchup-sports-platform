/**
 * 후기 작성 — 위쪽 선수 패널이 열려 있을 때 아래 선수를 누르면 위 패널이 접히며 누른 행이
 * 화면에서 밀려난다(alpha 실측: 317px). 누른 행은 제자리에 남아야 한다.
 * jsdom 은 레이아웃이 없어 행 높이·스크롤러를 직접 흉내 낸다(브라우저 API 대역).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1ReviewSourceResponse } from '@/types/api';
import { scrollTopToKeepAnchor } from './review-scroll-anchor';
import { ReviewSourcePageView } from './reviews-page';
import { toReviewSourcePageModel } from './reviews.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews/team_match/tm-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('scrollTopToKeepAnchor', () => {
  it('위쪽 패널이 접혀 행이 317px 올라갔으면 그만큼 되돌린다', () => {
    expect(scrollTopToKeepAnchor(496, 500, 183)).toBe(179);
  });

  it('아래쪽 패널이 접혀 행이 그대로면 scrollTop 을 건드리지 않는다', () => {
    expect(scrollTopToKeepAnchor(496, 500, 500)).toBe(496);
  });

  it('되돌릴 만큼의 스크롤이 남아 있지 않으면 0 에서 멈춘다', () => {
    expect(scrollTopToKeepAnchor(100, 500, 183)).toBe(0);
  });
});

const reviewerTeam = { teamId: 'team-mine', name: '우리팀', role: 'member' as const };
const player = (id: string, name: string) => ({
  imageUrl: null,
  alreadySubmitted: false,
  review: null,
  locked: false,
  lockReason: null,
  reviewerTeam,
  targetType: 'user' as const,
  targetUserId: id,
  targetTeamId: null,
  name,
  subtitle: '상대 선수',
});
const source: V1ReviewSourceResponse = {
  source: { sourceType: 'team_match', sourceId: 'tm-1', title: '우리팀 vs 상대팀', completedAt: '2026-08-18T00:00:00.000Z' },
  reviewerTeam,
  targets: [player('u1', '김선수'), player('u2', '이선수'), player('u3', '박선수')],
};
const model = toReviewSourcePageModel(source);

const LIST_TOP = 300;
const CLOSED_HEIGHT = 60;
const OPEN_HEIGHT = 380;
const GAP = 8;

let scrollTop: number;
let scrollTopWrites: number;

function StatefulPage() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <div className="tm-scroll-area" data-testid="scroller" style={{ overflowY: 'auto' }}>
        <ReviewSourcePageView
          drafts={{}}
          errorMessage={null}
          loading={false}
          message={null}
          model={model}
          onClearDraft={() => {}}
          onRetry={() => {}}
          onSubmit={() => {}}
          onToggleOpen={(key) => setOpenKey((current) => (current === key ? null : key))}
          onToggleTag={() => {}}
          onUpdateMetricScore={() => {}}
          onUpdateRating={() => {}}
          openKey={openKey}
          submitting={false}
        />
      </div>
    </QueryClientProvider>
  );
}

// 선수 행은 접히면 60px, 펼치면 380px 이라고 보고 스크롤 위치만큼 위로 민다.
function fakeTop(item: Element) {
  const items = [...document.querySelectorAll('.tm-review-player')];
  const above = items.slice(0, items.indexOf(item));
  const stackHeight = above.reduce(
    (sum, el) => sum + (el.getAttribute('data-open') === 'true' ? OPEN_HEIGHT : CLOSED_HEIGHT) + GAP,
    0,
  );
  return LIST_TOP + stackHeight - scrollTop;
}

beforeEach(() => {
  scrollTop = 500;
  scrollTopWrites = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this.classList.contains('tm-review-player') ? fakeTop(this) : 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => scrollTop);
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation((value: number) => {
    scrollTop = value;
    scrollTopWrites += 1;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
const itemOf = (name: string) => row(name).closest('.tm-review-player') as HTMLElement;

describe('후기 작성 — 선수 행을 눌러도 화면이 튀지 않는다', () => {
  it('위쪽 선수 패널이 열려 있으면, 아래 선수를 눌러도 누른 행이 제자리에 남는다', async () => {
    const user = userEvent.setup();
    render(<StatefulPage />);
    await user.click(row('김선수'));
    scrollTopWrites = 0;
    const before = fakeTop(itemOf('박선수'));

    await user.click(row('박선수'));

    expect(itemOf('김선수').getAttribute('data-open')).toBe('false');
    expect(itemOf('박선수').getAttribute('data-open')).toBe('true');
    expect(fakeTop(itemOf('박선수'))).toBe(before);
    expect(scrollTop).toBe(500 - (OPEN_HEIGHT - CLOSED_HEIGHT));
  });

  it('접히는 패널이 누른 행보다 아래면 스크롤을 건드리지 않는다', async () => {
    const user = userEvent.setup();
    render(<StatefulPage />);
    await user.click(row('박선수'));
    scrollTopWrites = 0;
    const before = fakeTop(itemOf('김선수'));

    await user.click(row('김선수'));

    expect(itemOf('박선수').getAttribute('data-open')).toBe('false');
    expect(fakeTop(itemOf('김선수'))).toBe(before);
    expect(scrollTop).toBe(500);
    expect(scrollTopWrites).toBe(0);
  });
});
