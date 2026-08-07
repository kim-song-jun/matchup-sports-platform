import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentOpsShell } from './tournament-ops-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/tournament-ops/tournaments/t-1/operations' }));

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
