import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PersonalMatchRecordsSection } from './personal-match-records-section';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1MyMatchesInfinite: mocks.query }));

function match(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    title: '주말 풋살',
    startsAt: '2026-09-20T09:00:00.000Z',
    status: 'completed',
    displayState: 'completed',
    viewer: { participantStatus: 'active' },
    host: { userId: 'host-1', displayName: '김주최' },
    hostParticipates: true,
    ...overrides,
  };
}

describe('PersonalMatchRecordsSection — 활동 기록 개인 탭', () => {
  it('완료·불참 아님 조건을 만족하는 개인매치만 세어 참여 횟수와 목록을 보여준다', () => {
    mocks.query.mockImplementation((mode: 'joined' | 'created') => {
      if (mode === 'joined') {
        return {
          isLoading: false,
          isError: false,
          data: {
            pages: [{
              items: [
                match({ id: 'j1', title: '참여 매치', host: { displayName: '이호스트' } }),
                match({ id: 'j2', title: '불참 매치', viewer: { participantStatus: 'no_show' } }),
                match({ id: 'j3', title: '아직 안 끝난 매치', status: 'recruiting', displayState: 'recruiting' }),
              ],
            }],
          },
        };
      }
      return {
        isLoading: false,
        isError: false,
        data: {
          pages: [{
            items: [
              match({ id: 'c1', title: '내가 만든 매치' }),
              match({ id: 'c2', title: '운영만 한 매치', hostParticipates: false }),
            ],
          }],
        },
      };
    });

    render(<PersonalMatchRecordsSection fromHref="/users/user-1/records" />);

    // 참여 2회 — 참여 매치(joined) + 내가 만든 매치(created, hostParticipates 기본 true)
    expect(screen.getByText('참여')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('참여 매치')).toBeInTheDocument();
    expect(screen.getByText('내가 만든 매치')).toBeInTheDocument();
    expect(screen.getByText('이호스트님 매치 참여')).toBeInTheDocument();
    expect(screen.getByText('내가 주최')).toBeInTheDocument();
    // 완료 안 됨 / 불참 / 주최자 미참가 — 셋 다 제외된다.
    expect(screen.queryByText('불참 매치')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 안 끝난 매치')).not.toBeInTheDocument();
    expect(screen.queryByText('운영만 한 매치')).not.toBeInTheDocument();
    // 뒤로가기가 이 활동 기록으로 돌아오도록 출처를 함께 싣는다.
    expect(screen.getByRole('link', { name: /참여 매치/ })).toHaveAttribute(
      'href',
      '/matches/j1?from=%2Fusers%2Fuser-1%2Frecords',
    );
  });

  it('참여한 개인매치가 없으면 빈 상태를 보여준다', () => {
    mocks.query.mockReturnValue({ isLoading: false, isError: false, data: { pages: [{ items: [] }] } });

    render(<PersonalMatchRecordsSection fromHref="/users/user-1/records" />);

    expect(screen.getByText('아직 참여한 개인매치가 없어요')).toBeInTheDocument();
  });

  it('더 보기로 참여·주최 이력의 남은 페이지를 함께 요청한다', () => {
    const fetchJoined = vi.fn();
    const fetchCreated = vi.fn();
    mocks.query.mockImplementation((mode: 'joined' | 'created') => ({
      isLoading: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage: mode === 'joined' ? fetchJoined : fetchCreated,
      data: { pages: [{ items: [match({ id: mode, title: `${mode} 매치` })] }] },
    }));

    render(<PersonalMatchRecordsSection fromHref="/users/user-1/records" />);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));

    expect(fetchJoined).toHaveBeenCalledOnce();
    expect(fetchCreated).toHaveBeenCalledOnce();
  });

  it('조회에 실패하면 에러 상태를 보여주고 재시도가 두 조회를 모두 다시 부른다', () => {
    const refetchJoined = vi.fn();
    const refetchCreated = vi.fn();
    mocks.query.mockImplementation((mode: 'joined' | 'created') => ({
      isLoading: false,
      isError: mode === 'joined',
      data: undefined,
      refetch: mode === 'joined' ? refetchJoined : refetchCreated,
    }));

    render(<PersonalMatchRecordsSection fromHref="/users/user-1/records" />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(refetchJoined).toHaveBeenCalledOnce();
    expect(refetchCreated).toHaveBeenCalledOnce();
  });
});
