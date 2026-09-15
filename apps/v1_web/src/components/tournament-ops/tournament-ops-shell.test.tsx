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
      <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="admin">
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
