/**
 * 매치 목록 밀도(2026-09-06 B안). 목록 본문은 행 카드로 통일하고, 배너 카드는
 * 사진이 있는 매치만 상단 가로 레일로 올린다. 배너를 목록에 그대로 두면 미디어가
 * 카드의 절반(146/286px)을 써서 390 폭에서 2.95장밖에 안 보였다(browse-density 스킬).
 */
import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMatchListViewModel } from './matches.view-model';
import { MatchListPageView } from './matches-page';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/matches' }));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));

const base = getMatchListViewModel();

function listWith(images: (string | null)[]) {
  const matches = images.map((image, i) => ({ ...base.matches[0], id: 'm' + i, image }));
  return render(<MatchListPageView model={{ ...base, matches, isLoading: false }} />);
}

describe('매치 목록 본문', () => {
  it('행 카드로 그린다 — 배너 카드는 본문에 없다', () => {
    const { container } = listWith([null, null, null]);

    const stack = container.querySelector('.tm-match-card-stack') as HTMLElement;
    expect(stack.querySelectorAll('.tm-match-row')).toHaveLength(3);
    expect(stack.querySelector('.tm-match-list-card')).toBeNull();
  });

  it('행 썸네일 안에 종목 그래픽을 넣는다 — 사진 없는 매치도 종목이 보인다', () => {
    const { container } = listWith([null]);

    const thumb = container.querySelector('.tm-match-row-thumb');
    expect(thumb).not.toBeNull();
    expect(thumb!.querySelector('img')).not.toBeNull();
  });
});

describe('상단 이벤트 레일', () => {
  it('사진이 있는 매치만 배너로 올리고, 본문 행 목록은 전부 유지한다', () => {
    const { container } = listWith(['/uploads/a.webp', null, '/uploads/b.webp']);

    const rail = container.querySelector('.tm-match-rail-h') as HTMLElement;
    expect(rail).not.toBeNull();
    expect(within(rail).getAllByRole('link')).toHaveLength(2);
    // 레일은 하이라이트일 뿐 목록을 대체하지 않는다 — 세 건 모두 본문에 남아야 한다.
    expect((container.querySelector('.tm-match-card-stack') as HTMLElement).querySelectorAll('.tm-match-row')).toHaveLength(3);
  });

  it('사진 있는 매치가 없으면 레일 자체를 그리지 않는다', () => {
    const { container } = listWith([null, null]);

    expect(container.querySelector('.tm-match-rail-section')).toBeNull();
  });
});
