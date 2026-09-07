/**
 * **개인 매치 상세의 "성별 조건" 행이 빈칸이 되던 회귀.**
 *
 * 카드 모델이 빈 값을 `'성별 미설정'` 문자열로 채우던 것을 걷어내면서(그래야 목록의
 * `match.gender ? … : null` 가드가 산다) 상세가 함께 깨졌다. 팀매치 화면은 **로컬**
 * `InfoRow`(`filled ? value : '미정'`)를 쓰지만, 개인 매치는 **공유**
 * `InfoRow`(`@/components/v1-ui/primitives`)를 쓰는데 그쪽은 `{value}` 를 그대로 그린다 —
 * 빈 값 처리가 없다. 그래서 값 슬롯이 통째로 비었다.
 *
 * 라벨이 있는 자리에서는 "모른다" 를 **말로** 해야 한다. 그 자리를 못 박는다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMatchDetailViewModel } from './matches.view-model';
import { MatchDetailPageView } from './matches-page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/matches/m1',
}));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));

function detail(gender: string) {
  const base = getMatchDetailViewModel();
  return { ...base, match: { ...base.match, gender } };
}

function genderRowText(container: HTMLElement): string {
  const label = [...container.querySelectorAll('.tm-info-row')].find((row) =>
    (row.textContent ?? '').includes('성별 조건'),
  );
  expect(label).toBeDefined();
  return (label!.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('개인 매치 상세 — 성별 조건 행', () => {
  it('성별을 정하지 않았으면 값 슬롯을 비우지 않고 미정이라고 말한다', () => {
    const { container } = render(<MatchDetailPageView model={detail('')} />);

    // 라벨만 남고 값이 사라지면 사용자는 화면이 깨진 것으로 읽는다.
    expect(genderRowText(container)).toBe('성별 조건미정');
  });

  it('정한 값이 있으면 그대로 보여준다', () => {
    const { container } = render(<MatchDetailPageView model={detail('성별 무관')} />);

    expect(genderRowText(container)).toBe('성별 조건성별 무관');
    expect(screen.queryByText('미정')).not.toBeInTheDocument();
  });
});
