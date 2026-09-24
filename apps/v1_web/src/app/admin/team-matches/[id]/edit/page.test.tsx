import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTeamMatchDetail } from '@/types/api';
import AdminTeamMatchEditPage from './page';

const { push, hooks, update } = vi.hoisted(() => ({
  push: vi.fn(),
  hooks: { detail: {} as Record<string, unknown> },
  update: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tm-1' }),
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/uuid', () => ({ randomUuid: () => '00000000-0000-4000-8000-000000000099' }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1AdminTeamMatch: () => hooks.detail,
  useV1MasterRegions: () => ({ data: [
    { id: 'seoul', name: '서울', parentId: null, level: 1 },
    { id: 'gangnam', name: '강남구', parentId: 'seoul', level: 2 },
  ] }),
  useV1UpdateAdminTeamMatchRecruitment: () => update,
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const DETAIL: V1AdminTeamMatchDetail = {
  platformManaged: true,
  teamMatchId: 'tm-1',
  title: '기존 관리자 모집전',
  hostTeamId: null,
  hostTeamName: null,
  league: null,
  tournament: null,
  sportName: '풋살',
  sportCode: 'futsal',
  sportId: 'sport-1',
  regionId: 'gangnam',
  minLevelCode: 'beginner',
  maxLevelCode: 'intermediate',
  version: '2026-09-01T00:00:00.000Z',
  startAt: '2026-10-20T10:00:00.000Z',
  status: 'recruiting',
  createdAt: '2026-09-01T00:00:00.000Z',
  description: '기존 안내',
  imageUrl: null,
  levelLabel: '초급~중급',
  regionName: '서울 강남구',
  placeName: '기존 풋살장',
  placeAddress: '서울 강남구',
  endAt: '2026-10-20T12:00:00.000Z',
  deadlineAt: '2026-10-19T10:00:00.000Z',
  approvedApplicantTeamId: null,
  approvedApplicantTeamName: null,
  createdByUserId: 'admin-1',
  createdByName: '운영자',
  hasGame: false,
  matchFormat: '5:5',
  formatNote: '전후반 20분',
  matchStyle: ['친선'],
  genderRule: '성별 무관',
  uniformColor: '파랑',
  costNote: '총 90,000원 · 상대팀 30,000원',
  applicationCount: 0,
  applications: [],
};

describe('AdminTeamMatchEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z'));
    hooks.detail = { data: DETAIL, isPending: false, isError: false, error: null, refetch: vi.fn() };
    update.isPending = false;
    update.mutateAsync.mockResolvedValue({ detailRoute: '/admin/team-matches/tm-1' });
  });

  afterEach(() => vi.useRealTimers());

  it('hydrates the platform recruitment and saves the current detail version', async () => {
    render(<AdminTeamMatchEditPage />);

    expect(screen.getByLabelText('종목')).toBeDisabled();
    expect(screen.getByLabelText('제목')).toHaveValue('기존 관리자 모집전');
    expect(screen.getByLabelText('최소 등급')).toHaveValue('beginner');
    expect(screen.getByLabelText('최대 등급')).toHaveValue('intermediate');
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '  수정 모집전  ' } });
    fireEvent.change(screen.getByLabelText('경기 장소'), { target: { value: '  새 풋살장  ' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 내용 저장' }));

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      clientCommandId: '00000000-0000-4000-8000-000000000099',
      version: '2026-09-01T00:00:00.000Z',
      sportId: 'sport-1',
      regionId: 'gangnam',
      title: '수정 모집전',
      manualPlaceName: '새 풋살장',
      minLevelCode: 'beginner',
      maxLevelCode: 'intermediate',
      matchStyle: ['친선'],
    })));
    expect(push).toHaveBeenCalledWith('/admin/team-matches/tm-1');
  });

  it('does not render an edit form after the match is finalized', () => {
    hooks.detail = { ...hooks.detail, data: { ...DETAIL, status: 'matched' } };
    render(<AdminTeamMatchEditPage />);
    expect(screen.getByText('수정할 수 없는 팀매치예요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정 내용 저장' })).not.toBeInTheDocument();
  });
});
