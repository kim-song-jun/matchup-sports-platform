import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';

const mocks = vi.hoisted(() => ({ query: vi.fn(), record: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-team-internal-matches', () => ({
  internalMatchErrorMessage: (_err: unknown, fallback: string) => fallback,
  useTeamInternalMatch: mocks.query,
  useDeleteInternalMatch: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordInternalMatchResult: () => ({ mutate: mocks.record, isPending: false }),
}));

import { TeamInternalMatchDetailPageClient } from './team-internal-match-detail';

const detail = (over = {}) => ({
  id: 'm1', teamId: 't1', playedAt: '2026-11-20T01:00:00.000Z', resultRecorded: false, canManage: true,
  sides: [
    { sideNumber: 1, name: '1팀', score: null, players: [{ userId: 'a', name: '가', isMe: true }, { userId: 'b', name: '나' }] },
    { sideNumber: 2, name: '2팀', score: null, players: [{ userId: 'c', name: '다' }] },
  ],
  goals: [], ...over,
});

describe('TeamInternalMatchDetailPageClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('팀원이 아니면(403) 팀원만 볼 수 있다고 안내한다', () => {
    mocks.query.mockReturnValue({ isLoading: false, isError: true, data: undefined, error: new V1ApiError({ statusCode: 403, code: 'TEAM_MEMBER_ONLY', message: '팀원만 볼 수 있어요' } as never) });
    render(<TeamInternalMatchDetailPageClient teamId="t1" matchId="m1" />);
    expect(screen.getByText('팀원만 볼 수 있어요')).toBeTruthy();
  });

  it('일반 팀원에게는 기록·삭제 버튼이 없다', () => {
    mocks.query.mockReturnValue({ isLoading: false, isError: false, data: detail({ canManage: false }) });
    render(<TeamInternalMatchDetailPageClient teamId="t1" matchId="m1" />);
    expect(screen.getByText('가 (나)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '결과 기록하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 지우기' })).toBeNull();
  });

  it('운영진은 점수와 득점·어시스트를 입력해 저장한다', () => {
    mocks.query.mockReturnValue({ isLoading: false, isError: false, data: detail() });
    render(<TeamInternalMatchDetailPageClient teamId="t1" matchId="m1" />);
    fireEvent.click(screen.getByRole('button', { name: '결과 기록하기' }));
    fireEvent.change(screen.getByLabelText('1팀 점수'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('2팀 점수'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '+ 득점 추가' }));
    fireEvent.change(screen.getByLabelText('득점자'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('어시스트'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(mocks.record.mock.calls[0][0]).toEqual({ scores: [2, 1], goals: [{ sideNumber: 1, scorerUserId: 'a', assistUserId: 'b' }] });
  });

  it('득점자를 비워 둔 줄이 있으면 저장하지 않는다', () => {
    mocks.query.mockReturnValue({ isLoading: false, isError: false, data: detail() });
    render(<TeamInternalMatchDetailPageClient teamId="t1" matchId="m1" />);
    fireEvent.click(screen.getByRole('button', { name: '결과 기록하기' }));
    fireEvent.click(screen.getByRole('button', { name: '+ 득점 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(mocks.record).not.toHaveBeenCalled();
    expect(screen.getByText('득점자를 고르거나 그 줄을 지워 주세요.')).toBeTruthy();
  });
});
