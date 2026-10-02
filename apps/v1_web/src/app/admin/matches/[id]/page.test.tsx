/**
 * 매치 상세 — 백엔드·훅·타입이 이미 있는데 화면이 없어 아무도 부르지 않던 API 를 잇는 페이지다.
 * 여기서 고정하는 것은 "응답의 어떤 값이 실제로 화면에 나오는가"다 — 필드를 빠뜨리면
 * 운영자는 목록에서 이미 보던 정보를 다시 볼 뿐인 화면을 얻는다.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1AdminMatchDetail } from '@/types/api';
import AdminMatchDetailPage from './page';

const { hooks } = vi.hoisted(() => ({ hooks: { query: {} as Record<string, unknown> } }));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'match-1' }) }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminMatch: () => hooks.query }));

const MATCH: V1AdminMatchDetail = {
  matchId: 'match-1',
  title: '성수 풋살 5:5',
  sportName: '풋살',
  sportCode: 'futsal',
  hostUserId: 'user-9',
  hostName: '김호스트',
  placeName: '성수 실내풋살장',
  startAt: '2026-09-01T11:00:00.000Z',
  status: 'recruiting',
  participantCount: 7,
  maxParticipants: 10,
  createdAt: '2026-08-01T00:00:00.000Z',
  description: '초보 환영이에요.\n주차 가능합니다.',
  regionName: '서울 성동구',
  deadlineAt: '2026-08-30T11:00:00.000Z',
  applicationCount: 3,
};

function renderWith(query: Record<string, unknown>) {
  hooks.query = query;
  return render(<AdminMatchDetailPage />);
}

const OK = { data: MATCH, isPending: false, isError: false, error: null, refetch: vi.fn() };

describe('AdminMatchDetailPage', () => {
  it('목록에 없던 정보까지 보여준다', () => {
    renderWith(OK);

    // 목록에도 있는 값
    expect(screen.getAllByText('성수 풋살 5:5').length).toBeGreaterThan(0);
    // 상세에서만 오는 값 — 이게 없으면 이 화면을 만들 이유가 없다
    expect(screen.getAllByText('서울 성동구').length).toBeGreaterThan(0);
    expect(screen.getByText(/초보 환영이에요/)).toBeInTheDocument();
    // aside 의 암묵 role 은 complementary 다(region 아님).
    const summary = screen.getByRole('complementary', { name: '매치 운영 요약' });
    expect(within(summary).getByText('7/10명')).toBeInTheDocument();
    expect(within(summary).getByText('3건')).toBeInTheDocument();
  });

  it('소개가 비어 있으면 빈칸 대신 안내를 보여준다', () => {
    renderWith({ ...OK, data: { ...MATCH, description: '   ' } });
    expect(screen.getByText('호스트가 입력한 소개가 없어요.')).toBeInTheDocument();
  });

  it('호스트 회원 상세로 가는 길을 준다', () => {
    renderWith(OK);
    expect(screen.getByRole('link', { name: '호스트 회원 상세 보기' })).toHaveAttribute(
      'href',
      '/admin/users/user-9',
    );
  });

  it('불러오지 못하면 재시도 경로를 준다', () => {
    const refetch = vi.fn();
    renderWith({ data: undefined, isPending: false, isError: true, error: new Error('boom'), refetch });
    expect(screen.getByText('매치 정보를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
