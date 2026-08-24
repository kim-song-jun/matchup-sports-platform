/**
 * D2 (E4, B안 확정): 어드민 이의 목록·처리 독립 페이지.
 * 태스크 문서 테스트 요구사항 3개를 커버한다 —
 *  1. 상태 필터가 훅 파라미터로 전달되는지
 *  2. open 행에만 액션 버튼(처리/거부)이 보이는지
 *  3. 처리/거부 mutation 이 disputeId·body 로 정확히 호출되는지
 * (전→후 스코어 입력 토글은 컴포넌트 단위로 league-dispute-resolve-modal.test.tsx 에서 검증한다.)
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { V1AdminLeagueMatchDisputeRow } from '@/types/league-match';
import AdminLeagueMatchDisputesPage from './page';

const { hooks, resolveMutate, rejectMutate } = vi.hoisted(() => ({
  hooks: { rows: [] as V1AdminLeagueMatchDisputeRow[], lastStatusArg: undefined as string | undefined },
  resolveMutate: vi.fn(),
  rejectMutate: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueDisputes: (status?: string) => {
    hooks.lastStatusArg = status;
    return {
      data: { items: hooks.rows },
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
  useV1ResolveLeagueDispute: () => ({ mutate: resolveMutate, isPending: false }),
  useV1RejectLeagueDispute: () => ({ mutate: rejectMutate, isPending: false }),
}));

const OPEN_ROW: V1AdminLeagueMatchDisputeRow = {
  id: 'dispute-open-1',
  leagueId: 'league-1',
  leagueTitle: '가을 풋살 리그',
  teamMatchId: 'tm-1',
  homeTeamName: '성수 FC',
  awayTeamName: '왕십리 유나이티드',
  reason: '심판 판정에 오류가 있었어요',
  raisedByTeamId: 'team-home-1',
  raisedByTeamName: '성수 FC',
  status: 'open',
  resolution: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  currentHomeScore: 2,
  currentAwayScore: 1,
};

const ACCEPTED_ROW: V1AdminLeagueMatchDisputeRow = {
  ...OPEN_ROW,
  id: 'dispute-accepted-1',
  status: 'accepted',
  resolution: 'correction',
};

function renderWith(rows: V1AdminLeagueMatchDisputeRow[]) {
  hooks.rows = rows;
  return render(<AdminLeagueMatchDisputesPage />);
}

describe('AdminLeagueMatchDisputesPage', () => {
  it('기본 상태 필터는 open 이고, 훅에 그대로 전달된다', () => {
    renderWith([OPEN_ROW]);
    expect(hooks.lastStatusArg).toBe('open');
  });

  it('상태 칩을 누르면 그 값이 훅 파라미터로 전달된다', async () => {
    const user = userEvent.setup();
    renderWith([OPEN_ROW]);

    await user.click(screen.getByRole('button', { name: '수락됨' }));
    expect(hooks.lastStatusArg).toBe('accepted');
  });

  it('open 행에만 처리·거부 버튼이 보인다', () => {
    renderWith([OPEN_ROW, ACCEPTED_ROW]);

    // 카드/테이블 반응형 렌더 둘 다에서 렌더되므로 getAllBy로 존재 여부만 확인한다.
    expect(screen.getAllByRole('button', { name: '처리' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '거부' }).length).toBeGreaterThan(0);
  });

  it('processed(open이 아닌) 행에는 처리·거부 버튼이 없다', () => {
    renderWith([ACCEPTED_ROW]);

    expect(screen.queryByRole('button', { name: '처리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '거부' })).not.toBeInTheDocument();
  });

  it('처리 모달에서 정정으로 제출하면 resolve mutation 이 disputeId·body 로 호출된다', async () => {
    const user = userEvent.setup();
    renderWith([OPEN_ROW]);

    await user.click(screen.getAllByRole('button', { name: '처리' })[0]);
    // 모달 오픈 60ms 뒤 첫 포커스 가능 요소(처리 방식 라디오)로 자동 포커스가 한 번 더
    // 이동한다(league-dispute-resolve-modal.tsx) — 그 전에 스코어 입력을 타이핑하면
    // 포커스가 빼앗겨 입력이 중간에 끊긴다. 오토포커스가 이미 끝난 뒤부터 입력한다.
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 기본 처리 방식은 '정정' — 스코어 입력에 값을 채운다.
    await user.clear(screen.getByLabelText('성수 FC'));
    await user.type(screen.getByLabelText('성수 FC'), '3');
    await user.clear(screen.getByLabelText('왕십리 유나이티드'));
    await user.type(screen.getByLabelText('왕십리 유나이티드'), '1');
    await user.type(screen.getByLabelText(/처리 사유/), '재검토 결과 스코어 오류 확인');
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(resolveMutate).toHaveBeenCalledWith(
      {
        disputeId: 'dispute-open-1',
        body: { resolution: 'correction', note: '재검토 결과 스코어 오류 확인', homeScore: 3, awayScore: 1 },
      },
      expect.anything(),
    );
  });

  it('거부 모달에서 제출하면 reject mutation 이 disputeId·body 로 호출된다', async () => {
    const user = userEvent.setup();
    renderWith([OPEN_ROW]);

    await user.click(screen.getAllByRole('button', { name: '거부' })[0]);
    await user.type(screen.getByLabelText(/거부 사유/), '근거가 충분하지 않아요');
    await user.click(screen.getByRole('button', { name: '거부하기' }));

    expect(rejectMutate).toHaveBeenCalledWith(
      { disputeId: 'dispute-open-1', body: { note: '근거가 충분하지 않아요' } },
      expect.anything(),
    );
  });
});
