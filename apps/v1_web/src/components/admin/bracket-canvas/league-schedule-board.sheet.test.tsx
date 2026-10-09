import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installViewport, resizeViewport } from '@/test/viewport';
import { makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1LeagueFixture } from '@/types/league-match';
import { LeagueScheduleBoard } from './league-schedule-board';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentRegistrations: () => ({ data: { items: [], truncated: false }, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useV1RandomFillSlots: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1QuickResult: () => ({ mutate: vi.fn(), isPending: false }),
}));

const FIXTURE: V1LeagueFixture = {
  teamMatchId: 'fx-1', title: '가을 리그', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2',
  startAt: '2030-01-07T10:00:00.000Z', placeName: '망원 유수지', status: 'matched',
};
const SLOTS = [makeSlot({ id: 's1', position: 1, label: '1번 자리' }), makeSlot({ id: 's2', position: 2, label: '2번 자리' })];

let restoreViewport: (() => void) | null = null;
afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('LeagueScheduleBoard — 태블릿 시트 안의 실제 패널', () => {
  it('시트 안에 경기 제목 헤딩이 하나만 있고(시트 헤더와 패널 헤더 중복 없음), 닫기 버튼도 하나다', () => {
    restoreViewport = installViewport(1023);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LeagueScheduleBoard
          leagueId="league-1" fixtures={[FIXTURE]} slots={SLOTS} teams={[]} canWrite showToast={vi.fn()}
          onOpenTemplate={vi.fn()} onEditSchedule={vi.fn()} onCancelFixture={vi.fn()} onShowList={vi.fn()}
        />
      </QueryClientProvider>,
    );
    resizeViewport(1023);
    fireEvent.click(screen.getByRole('button', { name: /경기 상세 열기$/ }));

    const sheet = screen.getByRole('dialog', { name: '1번 자리 vs 2번 자리' });
    expect(within(sheet).getAllByRole('heading', { name: '1번 자리 vs 2번 자리' })).toHaveLength(1);
    expect(within(sheet).getAllByRole('button', { name: /닫기$/ })).toHaveLength(1);
  });
});
