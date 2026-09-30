import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { TeamMatchOpponentLineupPageClient } from './opponent-lineup-client';

const query = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1TeamMatchOpponentLineup: () => query.value }));

const apiError = (statusCode: number, code: string) =>
  new V1ApiError({ status: 'error', statusCode, code, message: code, timestamp: '2026-09-30T00:00:00.000Z' });

describe('상대 참석명단 화면 (H5 D-2)', () => {
  beforeEach(() => {
    query.value = {};
  });

  it('공개 뒤에는 번호와 이름만 서버 순서대로 읽기 전용으로 보인다', () => {
    query.value = {
      isLoading: false,
      isError: false,
      data: {
        teamMatchId: 'tm-1',
        teamName: '합정 유나이티드',
        publicLineupAt: '2026-09-30T11:00:00.000Z',
        participants: [
          { jerseyNumber: 1, displayName: '선수10' },
          { jerseyNumber: 11, displayName: '선수15' },
          { jerseyNumber: null, displayName: '게스트' },
        ],
      },
    };
    render(<TeamMatchOpponentLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByRole('heading', { name: '합정 유나이티드' })).toBeInTheDocument();
    expect(screen.getByText(/3명 · 등번호와 이름만 보여요/)).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['등번호 1선수10', '등번호 11선수15', '등번호 없음–게스트']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [apiError(403, 'OPPONENT_LINEUP_NOT_PUBLIC'), '상대 참석명단은 아직 공개 전이에요'],
    [apiError(404, 'OPPONENT_LINEUP_NOT_SUBMITTED'), '상대 팀이 아직 참석명단을 내지 않았어요'],
  ])('공개 전·미제출은 오류가 아니라 안내로 답하고 경기 상세로 돌려보낸다', (error, title) => {
    query.value = { isLoading: false, isError: true, error, data: undefined, refetch: vi.fn() };
    render(<TeamMatchOpponentLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 상세로' })).toHaveAttribute('href', '/team-matches/tm-1');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
