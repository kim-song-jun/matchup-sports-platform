import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useV1AdminTournaments } from '@/hooks/use-v1-api';
import { TournamentOpsPickerClient } from './tournament-ops-picker-client';

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTournaments: vi.fn() }));

const TOURNAMENT = {
  id: 't-1', title: '가을 풋살 대회', status: 'in_progress', venue: '잠실',
  scheduledAt: '2026-08-10T11:00:00.000Z', scheduledEndAt: null,
  registrationDeadlineAt: null, registrationCount: 8, entryFee: 0,
} as const;

describe('TournamentOpsPickerClient (T6-3)', () => {
  beforeEach(() => {
    vi.mocked(useV1AdminTournaments).mockReturnValue({
      data: { items: [TOURNAMENT], pageInfo: undefined, summary: { total: 1, byStatus: {} } },
      isPending: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
  });

  it('행 액션이 admin CRUD 상세를 건너뛰고 곧장 ops 운영 보드로 연결된다', () => {
    render(<TournamentOpsPickerClient />);
    // AdminDataTable은 데스크톱 테이블 + 모바일 카드 리스트를 동시에 DOM에 렌더한다
    // (CSS hidden/lg:hidden으로만 전환 — jsdom은 레이아웃을 계산하지 않는다). 그래서
    // 각 행 액션이 항상 2벌 존재한다 — 다른 T6 태스크 테스트와 동일한 convention.
    const links = screen.getAllByRole('link', { name: /가을 풋살 대회 운영 콘솔 열기/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin/live/t-1/operations');
    }
  });

  it('기본 상태 필터는 진행 중(in_progress)이다', () => {
    render(<TournamentOpsPickerClient />);
    expect(vi.mocked(useV1AdminTournaments)).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });
});
