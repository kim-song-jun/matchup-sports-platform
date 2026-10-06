import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Tournament } from '@/types/api';
import AdminTournamentsPage from './page';

const row = {
  id: 'synthetic-tournament',
  title: '합성 대회 일정',
  status: 'in_progress',
  scheduledAt: '2026-10-11T16:24:00.000Z',
  scheduledEndAt: '2026-10-12T00:24:00.000Z',
  registrationDeadlineAt: '2026-10-04T15:24:00.000Z',
  entryFee: 0,
  registrationCount: 12,
  venue: null,
} satisfies Pick<V1Tournament,
  'id' | 'title' | 'status' | 'scheduledAt' | 'scheduledEndAt' | 'registrationDeadlineAt'
  | 'entryFee' | 'registrationCount' | 'venue'>;

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: [] } }),
  useV1MockSeedAvailability: () => ({ data: { enabled: false } }),
  useV1CreateMockTournament: () => ({ mutate: vi.fn(), isPending: false }),
  useV1AdminTournaments: () => ({
    data: {
      items: [row],
      pageInfo: { page: 1, limit: 20, totalPages: 1, total: 1 },
      summary: { total: 1, byStatus: { in_progress: 1 } },
    },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/tournaments');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminTournamentsPage 실제 날짜 열 · MD-QA #27', () => {
  it('로컬 getter가 UTC 벽시계여도 실제 일정·접수 마감 열은 KST로 표시한다', () => {
    // Given: 실제 formatter는 유지하고 로컬 getter만 UTC 벽시계로 통제한다.
    // KST 개발 기기에서도 목록 caller가 공용 local formatter로 돌아가면 이 테스트가 깨진다.
    // 실제 호스트 TZ/offset 증명은 date-utils.test.ts의 새 Node 프로세스가 담당한다.
    vi.spyOn(Date.prototype, 'getMonth').mockImplementation(function (this: Date) { return this.getUTCMonth(); });
    vi.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) { return this.getUTCDate(); });
    vi.spyOn(Date.prototype, 'getHours').mockImplementation(function (this: Date) { return this.getUTCHours(); });
    vi.spyOn(Date.prototype, 'getMinutes').mockImplementation(function (this: Date) { return this.getUTCMinutes(); });

    // When: hook의 같은 ISO 원본을 실제 목록과 공유 테이블로 렌더한다.
    render(<AdminTournamentsPage />);

    // Then: 둘 다 개요의 고정 KST 날짜·시각과 일치한다.
    const table = within(screen.getByRole('table'));
    expect(table.getByRole('cell', { name: '10.12 01:24 ~ 10.12 09:24' })).toBeInTheDocument();
    expect(table.getByRole('cell', { name: '10.5 00:24' })).toBeInTheDocument();
  });
});
