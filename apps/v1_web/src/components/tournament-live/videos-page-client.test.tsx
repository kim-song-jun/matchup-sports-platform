import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideosPageClient } from './videos-page-client';
import type { TournamentVideoFixture } from '@/hooks/use-v1-fixture-videos';

const mocks = vi.hoisted(() => ({
  useTournamentOpsRole: vi.fn(),
  createLinkMutate: vi.fn(),
  uploadMutate: vi.fn(),
  deleteMutate: vi.fn(),
  videosResult: vi.fn(),
}));

vi.mock('@/components/tournament-ops/role-context', () => ({
  useTournamentOpsRole: () => mocks.useTournamentOpsRole(),
}));

// 머리말 eyebrow 가 대회명을 쓴다 — 이 테스트의 관심사는 영상 목록·등록이지 대회 조회가
// 아니므로 QueryClient 를 세우는 대신 훅만 목한다.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: () => ({ data: { title: '테스트 대회' } }),
}));

vi.mock('@/hooks/use-v1-fixture-videos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-fixture-videos')>();
  return {
    ...actual,
    useTournamentFixtureVideos: () => mocks.videosResult(),
    useCreateFixtureVideoLink: () => ({ mutate: mocks.createLinkMutate, isPending: false }),
    useUploadFixtureVideo: () => ({ mutate: mocks.uploadMutate, isPending: false }),
    useDeleteFixtureVideo: () => ({ mutate: mocks.deleteMutate, isPending: false }),
  };
});

const FIXTURE: TournamentVideoFixture = {
  fixtureId: 'fixture-1',
  round: 'final',
  fixtureNumber: 1,
  legNumber: 1,
  scheduledAt: '2026-08-20T10:00:00.000Z',
  status: 'completed',
  homeTeamName: '서울FC',
  awayTeamName: '부산FC',
  videos: [
    {
      id: 'video-1',
      title: '결승골',
      url: 'https://youtu.be/abcdefghijk',
      sortOrder: 0,
      source: 'external',
      createdAt: '2026-08-20T12:00:00.000Z',
    },
    {
      id: 'video-2',
      title: null,
      url: '/uploads/2026/08/clip.mp4',
      sortOrder: 1,
      source: 'upload',
      createdAt: '2026-08-20T12:05:00.000Z',
    },
  ],
};

function setVideos(items: TournamentVideoFixture[]) {
  mocks.videosResult.mockReturnValue({
    isPending: false,
    isError: false,
    data: { items },
    error: null,
    refetch: vi.fn(),
  });
}

describe('VideosPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useTournamentOpsRole.mockReturnValue('TOURNAMENT_DIRECTOR');
    setVideos([FIXTURE]);
  });

  it('등록된 영상을 출처와 함께 보여준다 — 아이콘만으로 구분하지 않는다', () => {
    render(<VideosPageClient tournamentId="t-1" />);

    expect(screen.getByText(/결승 1경기 · 서울FC vs 부산FC/)).toBeInTheDocument();
    expect(screen.getByText('결승골')).toBeInTheDocument();
    // 출처는 아이콘 옆 문구로도 드러나야 한다(색·아이콘만으로 구분 금지).
    expect(screen.getByText(/^외부 링크 · https:\/\/youtu\.be\/abcdefghijk$/)).toBeInTheDocument();
    expect(screen.getByText(/^업로드한 파일 · \/uploads\/2026\/08\/clip\.mp4$/)).toBeInTheDocument();
    // 제목이 없는 영상은 순번으로 대체된다.
    expect(screen.getByText('경기 영상 2')).toBeInTheDocument();
  });

  it('업로드 한도와 허용 형식을 미리 알려준다', () => {
    render(<VideosPageClient tournamentId="t-1" />);

    expect(screen.getByText(/mp4, webm, mov/)).toBeInTheDocument();
    expect(screen.getByText(/200MB/)).toBeInTheDocument();
  });

  it('링크를 등록하면 입력한 주소와 제목이 그대로 전달된다', async () => {
    const user = userEvent.setup();
    render(<VideosPageClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '영상 추가' }));
    await user.type(screen.getByLabelText('영상 주소'), 'https://youtu.be/zzzzzzzzzzz');
    await user.type(screen.getByLabelText('제목 (선택)'), '  후반 하이라이트  ');
    await user.click(screen.getByRole('button', { name: '영상 등록' }));

    expect(mocks.createLinkMutate).toHaveBeenCalledWith(
      { fixtureId: 'fixture-1', url: 'https://youtu.be/zzzzzzzzzzz', title: '후반 하이라이트' },
      expect.anything(),
    );
  });

  it('한도를 넘는 파일은 업로드를 보내지 않고 이유를 알려준다', async () => {
    const user = userEvent.setup();
    render(<VideosPageClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '영상 추가' }));
    await user.click(screen.getByRole('button', { name: '파일 업로드' }));

    const oversized = new File(['x'], 'game.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversized, 'size', { value: 201 * 1024 * 1024 });
    await user.upload(screen.getByLabelText('영상 파일'), oversized);
    await user.click(screen.getByRole('button', { name: '영상 등록' }));

    expect(mocks.uploadMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('200MB까지 올릴 수 있어요');
  });

  it('삭제는 확인 모달을 거치고, 업로드 파일이면 파일도 지워진다고 알려준다', async () => {
    const user = userEvent.setup();
    render(<VideosPageClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '경기 영상 2 삭제' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/영상 파일도 서버에서 함께 지워져요/)).toBeInTheDocument();
    expect(mocks.deleteMutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: '영상 삭제' }));
    expect(mocks.deleteMutate).toHaveBeenCalledWith(
      { fixtureId: 'fixture-1', videoId: 'video-2' },
      expect.anything(),
    );
  });

  it('지원 담당에게는 등록·삭제 버튼을 노출하지 않는다', () => {
    mocks.useTournamentOpsRole.mockReturnValue('SUPPORT_READONLY');
    render(<VideosPageClient tournamentId="t-1" />);

    expect(screen.queryByRole('button', { name: '영상 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결승골 삭제' })).not.toBeInTheDocument();
    expect(screen.getByText(/등록·삭제는 대회 운영자/)).toBeInTheDocument();
  });

  it('경기가 없으면 빈 상태를 보여준다', () => {
    setVideos([]);
    render(<VideosPageClient tournamentId="t-1" />);

    expect(screen.getByText('아직 경기가 없어요')).toBeInTheDocument();
  });
});
