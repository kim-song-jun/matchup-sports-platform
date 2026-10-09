import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AdminMe,
  useV1CreateAdminTeamMatchRecruitment,
  useV1MasterRegions,
  useV1MasterSports,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import AdminTeamMatchNewPage from './page';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/uuid', () => ({ randomUuid: () => '00000000-0000-4000-8000-000000000001' }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PlaceSearch: () => ({ data: undefined, error: null, isFetching: false, isError: false, refetch: vi.fn() }),
  useV1PublicKakaoMapsKey: () => ({ data: undefined }),
  useV1AdminMe: vi.fn(),
  useV1CreateAdminTeamMatchRecruitment: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1UploadImages: vi.fn(),
}));

const useAdminMe = vi.mocked(useV1AdminMe, { partial: true });
const useCreate = vi.mocked(useV1CreateAdminTeamMatchRecruitment, { partial: true });
const useRegions = vi.mocked(useV1MasterRegions, { partial: true });
const useSports = vi.mocked(useV1MasterSports, { partial: true });
const useUploadImages = vi.mocked(useV1UploadImages, { partial: true });

/** 장소 필드는 검색 콤보박스다 — 검색 없이 이름만 직접 입력하는 경로로 값을 채운다. */
async function enterManualPlace(name: string) {
  fireEvent.change(screen.getByLabelText('경기 장소'), { target: { value: name } });
  fireEvent.click(await screen.findByRole('button', { name: '이름만 직접 입력' }));
}

describe('AdminTeamMatchNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-21T00:00:00Z'));
    useAdminMe.mockReturnValue({ data: { capabilities: ['status:write'] } } as never);
    useSports.mockReturnValue({ data: [{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }] } as never);
    useRegions.mockReturnValue({
      data: [
        { id: 'region-seoul', name: '서울', parentId: null, level: 1 },
        { id: 'region-gangnam', name: '강남구', parentId: 'region-seoul', level: 2 },
      ],
    } as never);
    useUploadImages.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ urls: ['/uploads/admin-team-match.webp'] }),
      isPending: false,
    } as never);
  });

  afterEach(() => vi.useRealTimers());

  it('opens recruitment without selecting teams and submits the regular team-match conditions', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      teamMatchId: 'tm-1',
      status: 'recruiting',
      detailRoute: '/admin/team-matches/tm-1',
      replayed: false,
    });
    useCreate.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    fireEvent.change(screen.getByLabelText('종목'), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-gangnam' } });
    fireEvent.change(screen.getByLabelText('매치 제목'), { target: { value: '  관리자 모집전  ' } });
    await enterManualPlace('  잠실 풋살장  ');
    fireEvent.change(screen.getByLabelText('최소 등급'), { target: { value: 'intermediate' } });
    fireEvent.change(screen.getByLabelText('최대 등급'), { target: { value: 'advanced' } });
    fireEvent.change(screen.getByLabelText('경기방식'), { target: { value: '5:5' } });
    fireEvent.click(screen.getByRole('button', { name: /^친선$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^매너 중시$/ }));
    fireEvent.change(screen.getByLabelText('경기 스타일 직접입력'), { target: { value: '패스 연습' } });
    fireEvent.change(screen.getByLabelText('유니폼 색상'), { target: { value: '파랑' } });
    fireEvent.change(screen.getByLabelText('성별 조건'), { target: { value: '성별 무관' } });
    fireEvent.change(screen.getByLabelText('총비용'), { target: { value: '90000' } });
    fireEvent.change(screen.getByLabelText('상대팀 부담금'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('신청 마감'), { target: { value: '2026-10-18T19:00' } });
    fireEvent.change(screen.getByLabelText('경기 시작'), { target: { value: '2026-10-20T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 신청 모집 시작하기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      sportId: 'sport-futsal',
      regionId: 'region-gangnam',
      title: '관리자 모집전',
      manualPlaceName: '잠실 풋살장',
      deadlineAt: '2026-10-18T10:00:00.000Z',
      startsAt: '2026-10-20T10:00:00.000Z',
      costNote: '총 90,000원 · 상대팀 30,000원',
      minLevelCode: 'intermediate',
      maxLevelCode: 'advanced',
      genderRule: '성별 무관',
      matchFormat: '5:5',
      matchStyle: ['친선', '매너 중시', '패스 연습'],
      uniformColor: '파랑',
    })));
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('homeTeamId');
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('awayTeamId');
    expect(push).toHaveBeenCalledWith('/admin/team-matches/tm-1');
  });

  it('직접 입력 칸에 이어서 친 장소 이름도 앞뒤 공백을 지우고 보낸다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ teamMatchId: 'tm-1', status: 'recruiting', detailRoute: '/admin/team-matches/tm-1', replayed: false });
    useCreate.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    fireEvent.change(screen.getByLabelText('종목'), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'region-gangnam' } });
    fireEvent.change(screen.getByLabelText('매치 제목'), { target: { value: '모집전' } });
    await enterManualPlace('잠실');
    fireEvent.change(screen.getByLabelText('경기 장소'), { target: { value: '  잠실 풋살장  ' } });
    fireEvent.change(screen.getByLabelText('경기 시작'), { target: { value: '2026-10-20T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 신청 모집 시작하기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ manualPlaceName: '잠실 풋살장' })));
  });

  it('matches the regular team-match condition inputs and permits no explicit deadline', () => {
    useCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    expect(screen.getByLabelText('목록 이미지')).toBeInTheDocument();
    expect(screen.getByLabelText('상세 이미지')).toBeInTheDocument();
    expect(screen.getByLabelText('최소 등급')).toBeInTheDocument();
    expect(screen.getByLabelText('최대 등급')).toBeInTheDocument();
    expect(screen.getByLabelText('경기방식')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^친선$/ })).toBeInTheDocument();
    expect(screen.getByLabelText('유니폼 색상')).toBeInTheDocument();
    expect(screen.getByLabelText('성별 조건')).toBeInTheDocument();
    expect(screen.getByLabelText('총비용')).toBeInTheDocument();
    expect(screen.getByLabelText('상대팀 부담금')).toBeInTheDocument();
    expect(screen.getByText('비워두면 경기 시작 전까지 신청을 받아요.')).toBeInTheDocument();
  });

  it('시작 시각을 KST 기준으로 검증한다 — KST 로 과거면 막고 미래면 통과한다 (TZ=UTC 러너)', () => {
    useCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<AdminTeamMatchNewPage />);
    // 시스템 시각 2026-09-21T00:00Z = KST 09:00. 08:00 KST 는 과거(로컬=UTC 해석이면 08:00Z 라 미래로 오판).
    fireEvent.change(screen.getByLabelText('경기 시작'), { target: { value: '2026-09-21T08:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('시작 시간은 지금 이후');
    fireEvent.change(screen.getByLabelText('경기 시작'), { target: { value: '2026-09-21T10:00' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('blocks a past deadline before making any request, then accepts a next-day end', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ detailRoute: '/admin/team-matches/tm-1' });
    useCreate.mockReturnValue({ mutateAsync, isPending: false } as never);
    render(<AdminTeamMatchNewPage />);
    for (const [label, value] of Object.entries({ 종목: 'sport-futsal', 지역: 'region-gangnam', '매치 제목': '자정 경기', '경기 시작': '2026-10-20T23:00', '경기 종료 (선택)': '2026-10-21T01:00', '신청 마감': '2000-01-01T12:00' })) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    await enterManualPlace('잠실');
    const submit = screen.getByRole('button', { name: '팀 신청 모집 시작하기' });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('신청 마감은 지금 이후');
    fireEvent.click(submit);
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('신청 마감'), { target: { value: '' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      endsAt: '2026-10-20T16:00:00.000Z', deadlineAt: null,
    })));
  });

  it('shows a read-only permission message to support admins', () => {
    useAdminMe.mockReturnValue({ data: { capabilities: ['overview:read'] } } as never);
    useCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<AdminTeamMatchNewPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('지원 관리자에게는 팀매치 모집 생성 권한이 없어요.');
    expect(screen.queryByRole('button', { name: '팀 신청 모집 시작하기' })).not.toBeInTheDocument();
  });
});
