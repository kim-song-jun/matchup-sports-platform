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

/**
 * 값 슬롯만 읽는다. 행 전체를 이어붙여 정확 일치를 요구하면 라벨·구분자 마크업이
 * 바뀌는 정상 변경에도 깨진다. 여기서 지켜야 할 계약은 "값 슬롯이 비지 않는다" 하나다.
 */
function genderRowValue(container: HTMLElement): string {
  const row = [...container.querySelectorAll('.tm-info-row')].find((candidate) =>
    (candidate.textContent ?? '').includes('성별 조건'),
  );
  expect(row).toBeDefined();
  const value = row!.querySelector('.tm-text-body');
  expect(value).not.toBeNull();
  return (value!.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('개인 매치 상세 — 성별 조건 행', () => {
  it('성별을 정하지 않았으면 값 슬롯을 비우지 않고 미정이라고 말한다', () => {
    const { container } = render(<MatchDetailPageView model={detail('')} />);

    // 라벨만 남고 값이 사라지면 사용자는 화면이 깨진 것으로 읽는다.
    expect(genderRowValue(container)).toBe('미정');
  });

  it('정한 값이 있으면 그대로 보여준다', () => {
    const { container } = render(<MatchDetailPageView model={detail('성별 무관')} />);

    expect(genderRowValue(container)).toBe('성별 무관');
    expect(screen.queryByText('미정')).not.toBeInTheDocument();
  });
});
