/**
 * PublicSiteMobileMenu 의 primary·groups prop 경로. 둘 다 안 주면(기존 호출부 전부) 지금과
 * 완전히 같은 마크업이어야 한다는 계약은 public-site-header.test.tsx 가 이미 지킨다 — 여기서는
 * 랜딩 v4 가 실제로 쓰는 새 경로(설명 행 렌더·그룹·로그인 순서)만 잡는다.
 */
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublicSiteMobileMenu } from './public-site-menus';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const PRIMARY = [
  { href: '/team-matches', label: '매치', description: '혼자여도 근처 경기에 바로 신청해요' },
  { href: '/teams', label: '팀', description: '팀원·명단·전적을 한곳에서' },
] as const;

const GROUPS = [{ label: '이용 안내', links: [{ href: '/help', label: '시작 가이드' }, { href: '/faq', label: '자주 묻는 질문' }] }];

describe('PublicSiteMobileMenu — primary·groups 경로', () => {
  it('큰 행에 라벨과 한 줄 설명을 함께 렌더하고, 이용 안내 그룹 → 로그인 순서로 이어진다', async () => {
    const user = userEvent.setup();
    render(<PublicSiteMobileMenu primary={PRIMARY} groups={GROUPS} />);
    await user.click(document.querySelector('button[aria-label="메뉴 열기"]') as HTMLElement);
    const menu = document.querySelector('nav[aria-label="전체 메뉴"]') as HTMLElement;

    const matchLink = within(menu).getByRole('link', { name: /매치/ });
    expect(matchLink).toHaveAttribute('href', '/team-matches');
    expect(within(matchLink).getByText('혼자여도 근처 경기에 바로 신청해요')).toBeInTheDocument();

    // 순서: 매치·팀 큰 행 → 이용 안내 그룹 → 로그인
    const hrefs = within(menu).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/team-matches', '/teams', '/help', '/faq', '/login']);
    // 기본 경로에만 있는 "서비스 소개"·독립 "도움말"·"문의" 링크는 이 경로엔 없다
    expect(within(menu).queryByRole('link', { name: '서비스 소개' })).toBeNull();
  });
});
