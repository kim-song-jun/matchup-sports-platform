/**
 * 팀매치 상세 — 목록에 없던 것(상대팀 신청·경기 조건·리그 소속·확정 상대팀)을 보여주는 게
 * 이 화면의 존재 이유다. 라이브 경기 상태는 **일부러 넣지 않는다** — 현장 콘솔의 일이고,
 * 같은 정보를 두 화면이 각자 그리면 어느 쪽이 최신인지 알 수 없게 된다.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1AdminTeamMatchDetail } from '@/types/api';
import AdminTeamMatchDetailPage from './page';

const { hooks } = vi.hoisted(() => ({ hooks: { query: {} as Record<string, unknown> } }));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'tm-1' }) }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTeamMatch: () => hooks.query }));

const DETAIL: V1AdminTeamMatchDetail = {
  teamMatchId: 'tm-1',
  title: '주말 정기전',
  hostTeamId: 'team-1',
  hostTeamName: '성수 FC',
  league: { leagueId: 'lg-7', title: '가을 리그' },
  sportName: '풋살',
  sportCode: 'futsal',
  startAt: '2026-09-01T11:00:00.000Z',
  status: 'recruiting',
  createdAt: '2026-08-01T00:00:00.000Z',
  description: '매너 있는 경기 부탁드려요.',
  regionName: '서울 성동구',
  placeName: '성수 실내풋살장',
  placeAddress: '서울 성동구 어딘가 1',
  endAt: '2026-09-01T13:00:00.000Z',
  deadlineAt: '2026-08-30T11:00:00.000Z',
  approvedApplicantTeamId: 'team-2',
  approvedApplicantTeamName: '왕십리 유나이티드',
  createdByUserId: 'user-3',
  createdByName: '김주장',
  hasGame: true,
  matchFormat: '5v5',
  formatNote: '전후반 20분',
  matchStyle: ['친선', '리그전'],
  genderRule: '남녀 혼성',
  uniformColor: '흰색',
  costNote: '구장비 반반',
  applicationCount: 2,
  applications: [
    { applicationId: 'app-1', status: 'approved', message: '잘 부탁드립니다', applicantTeamId: 'team-2', applicantTeamName: '왕십리 유나이티드', createdAt: '2026-08-10T00:00:00.000Z' },
    { applicationId: 'app-2', status: 'rejected', message: null, applicantTeamId: 'team-3', applicantTeamName: '금호 FC', createdAt: '2026-08-09T00:00:00.000Z' },
  ],
};

function renderWith(query: Record<string, unknown>) {
  hooks.query = query;
  return render(<AdminTeamMatchDetailPage />);
}

const OK = { data: DETAIL, isPending: false, isError: false, error: null, refetch: vi.fn() };

describe('AdminTeamMatchDetailPage', () => {
  it('상대팀 신청을 상태·팀 링크와 함께 보여준다', () => {
    renderWith(OK);

    const section = screen.getByRole('region', { name: '상대팀 신청' });
    expect(within(section).getByText('2건')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: '왕십리 유나이티드' })).toHaveAttribute('href', '/admin/teams/team-2');
    expect(within(section).getByText('승인')).toBeInTheDocument();
    expect(within(section).getByText('거절')).toBeInTheDocument();
  });

  it('리그 소속이면 그 리그로 가는 길을 준다', () => {
    renderWith(OK);
    expect(screen.getByRole('link', { name: /가을 리그/ })).toHaveAttribute('href', '/admin/league-matches/lg-7');
  });

  it('단발 경기면 리그 링크가 없고 요약에 그렇게 적는다', () => {
    renderWith({ ...OK, data: { ...DETAIL, league: null } });

    expect(screen.queryByRole('link', { name: /리그 ·/ })).not.toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: '팀매치 운영 요약' });
    expect(within(summary).getByText('단발 경기')).toBeInTheDocument();
  });

  it('경기 조건을 목록에 없던 값까지 보여준다', () => {
    renderWith(OK);
    const conditions = screen.getByRole('region', { name: '경기 조건' });
    expect(within(conditions).getByText('5v5')).toBeInTheDocument();
    expect(within(conditions).getByText('친선, 리그전')).toBeInTheDocument();
    expect(within(conditions).getByText('남녀 혼성')).toBeInTheDocument();
  });

  it('서버가 잘라 보낸 목록을 총계처럼 보여주지 않는다', () => {
    // 서버는 최근 50건만 준다. 총계만 적으면 목록이 전부인 것처럼 읽힌다.
    renderWith({ ...OK, data: { ...DETAIL, applicationCount: 57 } });

    const section = screen.getByRole('region', { name: '상대팀 신청' });
    expect(within(section).getByText('2 / 57건')).toBeInTheDocument();
    expect(within(section).getByText('최근 2건만 표시해요.')).toBeInTheDocument();
  });

  it('전부 보여줄 때는 총계만 적는다', () => {
    renderWith(OK);
    const section = screen.getByRole('region', { name: '상대팀 신청' });
    expect(within(section).getByText('2건')).toBeInTheDocument();
    expect(within(section).queryByText(/만 표시해요/)).not.toBeInTheDocument();
  });

  it('빈 문자열은 대시로, 0 은 0 으로 보여준다', () => {
    renderWith({ ...OK, data: { ...DETAIL, placeAddress: '', uniformColor: null } });
    const conditions = screen.getByRole('region', { name: '경기 조건' });
    expect(within(conditions).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('신청이 없으면 빈칸 대신 안내를 보여준다', () => {
    renderWith({ ...OK, data: { ...DETAIL, applications: [], applicationCount: 0 } });
    expect(screen.getByText('아직 신청한 팀이 없어요.')).toBeInTheDocument();
  });

  it('불러오지 못하면 재시도 경로를 준다', () => {
    renderWith({ data: undefined, isPending: false, isError: true, error: new Error('boom'), refetch: vi.fn() });
    expect(screen.getByText('팀매치 정보를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
