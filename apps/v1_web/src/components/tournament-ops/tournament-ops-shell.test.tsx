import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsShell } from './tournament-ops-shell';

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: { value: '/tournament-ops/tournaments/t-1/operations' } }));

vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock.value }));

beforeEach(() => {
  pathnameMock.value = '/tournament-ops/tournaments/t-1/operations';
});

describe('TournamentOpsShell 복귀 경로 (T6-2)', () => {
  it('origin="admin" → "대회 관리로 돌아가기" → /admin/tournaments/:id', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="admin" tournamentKind="regular_tournament">
        <div>content</div>
      </TournamentOpsShell>,
    );
    const links = screen.getAllByRole('link', { name: '대회 관리로 돌아가기' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin/tournaments/t-1');
  });

  it('origin="home" → 기존 "서비스로 돌아가기" → /home (회귀 없음)', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="home">
        <div>content</div>
      </TournamentOpsShell>,
    );
    const links = screen.getAllByRole('link', { name: '서비스로 돌아가기' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/home');
  });

  it('리그에서 온 어드민은 리그 관리로 돌아간다 — 대회 관리 상세는 리그 id 를 못 연다', () => {
    pathnameMock.value = '/admin/live/league-1/operations';
    render(
      <TournamentOpsShell tournamentId="league-1" role="PLATFORM_OPS" origin="admin" tournamentKind="regular_league">
        <div>content</div>
      </TournamentOpsShell>,
    );
    expect(screen.queryByRole('link', { name: '대회 관리로 돌아가기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '리그 관리로 돌아가기' })).toHaveAttribute('href', '/admin/league-matches/league-1');
  });

  it('복귀 링크는 본문 맨 위 한 곳뿐이다 — 사이드바 하단에 같은 링크를 또 두지 않는다', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="admin" tournamentKind="regular_tournament">
        <div data-testid="content">content</div>
      </TournamentOpsShell>,
    );
    const [link] = screen.getAllByRole('link', { name: '대회 관리로 돌아가기' });
    expect(screen.getAllByRole('link', { name: '대회 관리로 돌아가기' })).toHaveLength(1);
    expect(link.closest('main')).not.toBeNull();
    // 본문보다 앞에 있어야 화면 맨 위에 보인다.
    expect(link.compareDocumentPosition(screen.getByTestId('content')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('종류 조회 중(undefined)이면 어드민 복귀 링크를 숨긴다 — 리그 어드민이 대회 관리로 잘못 가지 않게', () => {
    render(
      <TournamentOpsShell tournamentId="league-1" role="PLATFORM_OPS" origin="admin">
        <div>content</div>
      </TournamentOpsShell>,
    );
    expect(screen.queryByRole('link', { name: /돌아가기/ })).not.toBeInTheDocument();
  });

  it('kind 가 null 인 옛 대회 행은 대회 관리로 돌아간다 — 링크가 사라지지 않는다', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="admin" tournamentKind={null}>
        <div>content</div>
      </TournamentOpsShell>,
    );
    expect(screen.getByRole('link', { name: '대회 관리로 돌아가기' })).toHaveAttribute('href', '/admin/tournaments/t-1');
  });
});

describe('TournamentOpsShell nav 항목 (T6-5, D-16)', () => {
  it('SUPPORT_READONLY도 결과 검토/정정이 보인다 — 숨기지 않고 비활성 + 사유', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="SUPPORT_READONLY" origin="home">
        <div>content</div>
      </TournamentOpsShell>,
    );
    expect(screen.queryByRole('link', { name: /결과 검토/ })).not.toBeInTheDocument();
    const reviewLabels = screen.getAllByText('결과 검토');
    expect(reviewLabels.length).toBeGreaterThan(0);
    expect(reviewLabels[0].closest('button')).toBeDisabled();
    expect(screen.getAllByText(/결과 검토·정정은/).length).toBeGreaterThan(0);
  });

  it('TOURNAMENT_DIRECTOR는 결과 검토/정정이 활성 링크로 보인다', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="TOURNAMENT_DIRECTOR" origin="home">
        <div>content</div>
      </TournamentOpsShell>,
    );
    const links = screen.getAllByRole('link', { name: /결과 검토/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', expect.stringContaining('/result-review'));
  });
});

describe('TournamentOpsShell nav 표면 (M5)', () => {
  // 같은 셸이 두 경로 표면에서 렌더된다. nav 가 자기 표면을 가리키지 않으면 어드민에서
  // 한 번 클릭할 때마다 스태프 경로로 튕겨 나가고(그 반대도 마찬가지) 셸이 다시 뜬다.
  it('스태프 표면에서는 nav 가 /tournament-ops 를 가리킨다', () => {
    render(
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="home">
        <div>content</div>
      </TournamentOpsShell>,
    );
    const links = screen.getAllByRole('link', { name: /운영 보드/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/operations');
    }
  });

  it('어드민 표면에서는 같은 nav 가 /admin/live 를 가리킨다', () => {
    pathnameMock.value = '/admin/live/t-1/operations';
    render(
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="admin">
        <div>content</div>
      </TournamentOpsShell>,
    );
    const links = screen.getAllByRole('link', { name: /운영 보드/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin/live/t-1/operations');
    }
  });
});

describe('TournamentOpsShell 모바일 상단 제목 (Task 180 G6-V4)', () => {
  // 콘솔 경로는 nav 항목에 없어서 상단 제목이 종류별 기본값으로 떨어진다.
  const mobileTitle = () => screen.getByRole('button', { name: '메뉴 열기' }).closest('header')?.textContent;

  it.each([
    ['regular_league', '리그 운영'],
    ['regular_tournament', '대회 운영'],
    [null, '대회 운영'],
  ] as const)('경기 콘솔에서 종류가 %s 면 상단 제목은 %s', (kind, title) => {
    pathnameMock.value = '/admin/live/c-1/fixtures/f-1/operate';
    render(
      <TournamentOpsShell tournamentId="c-1" role="PLATFORM_OPS" origin="admin" tournamentKind={kind}>
        <div>content</div>
      </TournamentOpsShell>,
    );
    expect(mobileTitle()).toBe(title);
  });

  it('nav 항목 화면에서는 종류와 무관하게 그 항목 이름이다', () => {
    pathnameMock.value = '/admin/live/c-1/operations';
    render(
      <TournamentOpsShell tournamentId="c-1" role="PLATFORM_OPS" origin="admin" tournamentKind="regular_league">
        <div>content</div>
      </TournamentOpsShell>,
    );
    expect(mobileTitle()).toBe('운영 보드');
  });
});
