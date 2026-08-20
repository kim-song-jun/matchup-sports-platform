/**
 * overview-section.test.tsx
 *
 * 개요는 "무엇이 비었는지"를 보여주고 **고칠 수 있는 화면으로 보내는** 것이 존재 이유다.
 * 목록만 뜨고 링크가 엉뚱한 데로 가면 화면이 없는 것과 같다.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1Tournament } from '@/types/api';
import { TournamentOverviewSection } from './overview-section';

const { tournamentQuery } = vi.hoisted(() => ({
  tournamentQuery: { current: {} as Record<string, unknown> },
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => tournamentQuery.current,
}));

vi.mock('./tournament-admin-context', () => ({
  useTournamentAdmin: () => ({ tournamentId: 'tournament-1', canWrite: true, showToast: vi.fn() }),
}));

function renderWith(tournament: Partial<V1Tournament>) {
  tournamentQuery.current = {
    data: {
      id: 'tournament-1',
      status: 'open',
      registrationDeadlineAt: '2099-08-25T09:00:00+09:00',
      rosterDeadlineAt: '2099-08-28T09:00:00+09:00',
      scheduledAt: '2099-08-30T09:00:00+09:00',
      scheduledEndAt: null,
      bracketPublishedAt: '2020-01-01T09:00:00+09:00',
      bracketPublishScheduledAt: null,
      coverImageUrl: '/uploads/2026/08/cover.webp',
      entryFee: 0,
      bankAccount: null,
      prizePool: 1000000,
      prizeSummary: null,
      prizeBreakdown: null,
      teamCount: 8,
      registrationCount: 5,
      operationCounts: { registrations: 5, fixtures: 12, announcements: 2 },
      ...tournament,
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  return render(<TournamentOverviewSection />);
}

describe('TournamentOverviewSection', () => {
  it('비어 있는 설정을 그것을 고칠 섹션 링크와 함께 보여준다', () => {
    renderWith({ registrationDeadlineAt: null, operationCounts: { registrations: 5, fixtures: 0, announcements: 2 } });

    const checklist = screen.getByRole('region', { name: '채워야 할 설정' });
    expect(within(checklist).getByText('접수 마감 시각이 없어요')).toBeInTheDocument();
    expect(within(checklist).getByRole('link', { name: /접수 마감 시각이 없어요/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tournament-1/info',
    );
    expect(within(checklist).getByRole('link', { name: /경기가 아직 없어요/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tournament-1/bracket',
    );
  });

  it('다 채워졌으면 목록 대신 확인 메시지를 보여준다', () => {
    renderWith({});

    expect(screen.queryByRole('region', { name: '채워야 할 설정' })).not.toBeInTheDocument();
    expect(screen.getByText('비어 있는 설정이 없어요.')).toBeInTheDocument();
  });

  it('규모 숫자는 해당 섹션으로 가는 링크다', () => {
    renderWith({});

    expect(screen.getByRole('link', { name: /신청 팀 5팀/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tournament-1/registrations',
    );
    expect(screen.getByRole('link', { name: /공지 2건/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tournament-1/announcements',
    );
  });

  it('마감이 지났는데 상태가 접수 중이면 확인 필요로 표시한다', () => {
    renderWith({ registrationDeadlineAt: '2020-01-01T09:00:00+09:00' });

    const band = screen.getByRole('region', { name: '대회 진행 상태' });
    expect(within(band).getByText('확인 필요')).toBeInTheDocument();
    expect(within(band).getByText('접수 마감 시각이 지났는데 아직 접수 중이에요.')).toBeInTheDocument();
  });

  it('참가자 화면으로 나가는 링크를 제공한다', () => {
    renderWith({});

    expect(screen.getByRole('link', { name: /참가자에게 보이는 화면 열기/ })).toHaveAttribute(
      'href',
      '/tournaments/tournament-1',
    );
  });
});
