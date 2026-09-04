/**
 * 웨이브 6(2026-09-04 감사) 회귀 방지:
 * - 오류를 EmptyState(회색 인박스)로 그리던 두 화면이 ErrorState + 재시도를 쓴다.
 * - 목록 카드마다 primary 가 생기던 §14 위반(초대 수락 / 내 매치 세그먼트)이 없다.
 * - 앱 안에서 들어갈 링크가 없던 /my/schedule 이 마이 홈 메뉴에 있다.
 * - /my/leagues 크롬이 형제 화면과 같아졌다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { MyInvitationsPageView, MyMatchesPageView } from './my-page';
import { myHomeModel } from './my.view-model';
import { resolveRouteChrome } from '@/lib/route-chrome';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));

describe('받은 초대', () => {
  const base = {
    invitations: [],
    loading: false,
    error: false,
    onRetry: vi.fn(),
    onAccept: vi.fn(),
    onDecline: vi.fn(),
  };

  it('오류는 ErrorState + 다시 불러오기로 그린다', () => {
    const onRetry = vi.fn();
    render(<MyInvitationsPageView model={{ ...base, error: true, onRetry }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('초대 목록을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('빈 상태에 그래픽과 다음 행동이 있다', () => {
    const { container } = render(<MyInvitationsPageView model={base} />);
    expect(queryImageBySrc(container, '/illustrations/auth-welcome-640.webp')).not.toBeNull();
    expect(container.querySelector('a.tm-btn-primary[href="/teams"]')).not.toBeNull();
  });

  it('초대 카드의 수락 버튼은 primary 가 아니다 — 카드 수만큼 주요 CTA 가 생기면 안 된다', () => {
    const model = {
      ...base,
      invitations: [
        { invitationId: 'i1', teamId: 't1', teamName: 'A팀', invitedByName: '팀장', dateLabel: '어제', message: null, logoUrl: null, actionPending: false },
        { invitationId: 'i2', teamId: 't2', teamName: 'B팀', invitedByName: '팀장', dateLabel: '오늘', message: null, logoUrl: null, actionPending: false },
      ],
    };
    const { container } = render(<MyInvitationsPageView model={model} />);
    expect(screen.getAllByRole('button', { name: /초대 수락/ })).toHaveLength(2);
    expect(container.querySelectorAll('.tm-btn-primary')).toHaveLength(0);
  });
});

describe('내 매치', () => {
  const base = { mode: 'joined' as const, matches: [], summary: [], loading: false, error: false, onRetry: vi.fn() };

  it('세그먼트 선택 상태는 primary 가 아니라 칩으로 표현한다', () => {
    const { container } = render(<MyMatchesPageView model={base} />);
    expect(container.querySelector('.tm-segment-row .tm-chip-active')).not.toBeNull();
    expect(container.querySelector('.tm-segment-row .tm-btn-primary')).toBeNull();
  });

  it('오류에 재시도가 있고, 빈 상태에는 그래픽과 CTA 가 있다', () => {
    const onRetry = vi.fn();
    const { rerender, container } = render(<MyMatchesPageView model={{ ...base, error: true, onRetry }} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<MyMatchesPageView model={base} />);
    expect(queryImageBySrc(container, '/illustrations/matches-empty-640.webp')).not.toBeNull();
    expect(container.querySelector('a.tm-btn-primary[href="/matches"]')).not.toBeNull();
  });
});

describe('마이 홈 메뉴', () => {
  it('내 일정 진입 링크가 있다 — 예전엔 URL 직접 입력으로만 닿는 고아 라우트였다', () => {
    const hrefs = myHomeModel.sections.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain('/my/schedule');
  });
});

describe('/my/leagues 크롬', () => {
  it('형제 마이 화면과 같은 activeTab·bottomNav·desktopHead 를 쓴다', () => {
    const resolved = resolveRouteChrome('/my/leagues');
    expect(resolved?.chrome.activeTab).toBe('my');
    expect(resolved?.chrome.bottomNav).toBe(false);
    expect(resolved?.chrome.desktopHead).toBe(true);
  });
});
