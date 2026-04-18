import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import UserPublicProfilePage from './page';
import type { UserPublicProfile } from '@/types/api';

const mockBack = vi.fn();
const mockPush = vi.fn();
const mockNotFound = vi.fn();
const mockToast = vi.fn();
const mockUseUserPublicProfile = vi.fn();
const mockStartDirectChatMutateAsync = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
  useParams: () => ({ id: 'user-123' }),
  notFound: () => mockNotFound(),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: null }),
}));

vi.mock('@/hooks/use-api', () => ({
  useUserPublicProfile: () => mockUseUserPublicProfile(),
  useStartDirectChat: () => ({
    mutateAsync: mockStartDirectChatMutateAsync,
    isPending: false,
  }),
}));

// UserPublicProfile shape — no PII fields (email, phone, bio, birthYear, etc.)
const publicProfileFixture = {
  id: 'user-123',
  nickname: '축구왕민수',
  profileImageUrl: null,
  mannerScore: 4.7,
  recentMatchCount: 32,
  sportProfiles: [
    {
      id: 'sp-1',
      sportType: 'futsal' as const,
      level: 3,
      eloRating: 1200,
      preferredPositions: ['striker'],
      matchCount: 30,
      winCount: 15,
      mvpCount: 5,
    },
  ],
};

describe('UserPublicProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserPublicProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: publicProfileFixture,
      refetch: vi.fn(),
    });
    mockStartDirectChatMutateAsync.mockResolvedValue({ id: 'room-1' });
  });

  it('renders public fields — nickname, manner score, sport profiles', () => {
    render(<UserPublicProfilePage />);

    expect(screen.getByText('축구왕민수')).toBeInTheDocument();
    expect(screen.getByText('4.7')).toBeInTheDocument();
    expect(screen.getByText('매너점수')).toBeInTheDocument();
    expect(screen.getByText('풋살')).toBeInTheDocument();
    expect(screen.getByText('중급')).toBeInTheDocument();
    expect(screen.getByText('30경기')).toBeInTheDocument();
  });

  it('renders recent match count when present', () => {
    render(<UserPublicProfilePage />);

    expect(screen.getByText('최근 경기 32회')).toBeInTheDocument();
  });

  it('does NOT render PII fields even if backend leaks them on the data object', () => {
    // Simulate a backend bug that returns PII fields despite the projected type.
    // The UI must never render these values regardless.
    const profileWithLeakedPII = {
      ...publicProfileFixture,
      email: 'leak@example.com',
      phone: '01012345678',
      birthYear: 1995,
      realName: '홍길동',
    } as unknown as UserPublicProfile; // PII-leak simulation

    mockUseUserPublicProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: profileWithLeakedPII,
      refetch: vi.fn(),
    });

    render(<UserPublicProfilePage />);

    // Literal PII values must never appear in rendered output
    expect(screen.queryByText('leak@example.com')).toBeNull();
    expect(screen.queryByText('01012345678')).toBeNull();
    expect(screen.queryByText('1995')).toBeNull();
    expect(screen.queryByText('홍길동')).toBeNull();
  });

  it('does not render email label anywhere on the page', () => {
    render(<UserPublicProfilePage />);

    // "이메일" label must never appear on public profile
    expect(screen.queryByText(/이메일/i)).toBeNull();
  });

  it('shows loading skeleton when data is loading', () => {
    mockUseUserPublicProfile.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    });

    const { container } = render(<UserPublicProfilePage />);

    // Skeleton divs with animate-pulse should be present
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it('shows error state when request fails', () => {
    mockUseUserPublicProfile.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch: vi.fn(),
    });

    render(<UserPublicProfilePage />);

    expect(screen.getByText('프로필을 불러오지 못했어요')).toBeInTheDocument();
  });

  it('calls notFound() when profile data is null (App Router 404)', () => {
    mockUseUserPublicProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: null,
      refetch: vi.fn(),
    });

    render(<UserPublicProfilePage />);

    expect(mockNotFound).toHaveBeenCalled();
  });

  it('has accessible back button', () => {
    render(<UserPublicProfilePage />);

    const backButton = screen.getByRole('button', { name: '뒤로 가기' });
    expect(backButton).toBeInTheDocument();
  });

  it('has chat button with correct aria-label', () => {
    render(<UserPublicProfilePage />);

    const chatButton = screen.getByRole('button', { name: '축구왕민수에게 채팅 보내기' });
    expect(chatButton).toBeInTheDocument();
  });
});
