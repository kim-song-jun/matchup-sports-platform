import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import TeamMembersPage from './page';

const mockBack = vi.fn();
const mockPush = vi.fn();
const mockToast = vi.fn();

const mockUseTeamMembers = vi.fn();
const mockUseTeamApplications = vi.fn();
const mockUseAcceptTeamApplication = vi.fn();
const mockUseRejectTeamApplication = vi.fn();
const mockUseStartDirectChat = vi.fn();
const mockUseUpdateTeamMemberRole = vi.fn();
const mockUseRemoveTeamMember = vi.fn();
const mockUseLeaveTeam = vi.fn();
const mockUseRequireAuth = vi.fn();
const mockUseAuthStore = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useParams: () => ({ id: 'team-abc' }),
  useSearchParams: vi.fn(() => ({ get: () => null })),
}));

vi.mock('@/hooks/use-require-auth', () => ({
  useRequireAuth: () => mockUseRequireAuth(),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

vi.mock('@/components/teams/transfer-ownership-modal', () => ({
  TransferOwnershipModal: () => null,
}));

vi.mock('@/hooks/use-api', () => ({
  useTeamMembers: () => mockUseTeamMembers(),
  useTeamApplications: () => mockUseTeamApplications(),
  useAcceptTeamApplication: () => mockUseAcceptTeamApplication(),
  useRejectTeamApplication: () => mockUseRejectTeamApplication(),
  useStartDirectChat: () => mockUseStartDirectChat(),
  useUpdateTeamMemberRole: () => mockUseUpdateTeamMemberRole(),
  useRemoveTeamMember: () => mockUseRemoveTeamMember(),
  useLeaveTeam: () => mockUseLeaveTeam(),
}));

const ownerMember = {
  id: 'mem-1',
  userId: 'owner-user-id',
  teamId: 'team-abc',
  role: 'owner' as const,
  status: 'active',
  joinedAt: '2026-01-01T00:00:00Z',
  user: { id: 'owner-user-id', nickname: '팀장김철수', profileImageUrl: null, mannerScore: 4.8 },
};

const regularMember = {
  id: 'mem-2',
  userId: 'regular-user-id',
  teamId: 'team-abc',
  role: 'member' as const,
  status: 'active',
  joinedAt: '2026-01-05T00:00:00Z',
  user: { id: 'regular-user-id', nickname: '일반회원이영희', profileImageUrl: null, mannerScore: 4.2 },
};

const applicantRecord = {
  id: 'app-1',
  userId: 'applicant-user-id',
  teamId: 'team-abc',
  createdAt: '2026-04-18T10:00:00Z',
  user: {
    id: 'applicant-user-id',
    nickname: '신청자박지훈',
    profileImageUrl: null,
    mannerScore: 4.0,
  },
};

const defaultMutate = vi.fn();
const defaultMutationReturn = { mutate: defaultMutate, isPending: false };

describe('TeamMembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseRequireAuth.mockReturnValue(undefined);
    mockUseAuthStore.mockReturnValue({ user: { id: 'owner-user-id' } });

    mockUseTeamMembers.mockReturnValue({
      data: [ownerMember, regularMember],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockUseTeamApplications.mockReturnValue({
      data: [applicantRecord],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockUseAcceptTeamApplication.mockReturnValue(defaultMutationReturn);
    mockUseRejectTeamApplication.mockReturnValue(defaultMutationReturn);
    mockUseStartDirectChat.mockReturnValue(defaultMutationReturn);
    mockUseUpdateTeamMemberRole.mockReturnValue(defaultMutationReturn);
    mockUseRemoveTeamMember.mockReturnValue(defaultMutationReturn);
    mockUseLeaveTeam.mockReturnValue(defaultMutationReturn);
  });

  describe('members tab (default view)', () => {
    it('renders member list for owner', () => {
      render(<TeamMembersPage />);

      expect(screen.getByText('팀장김철수')).toBeInTheDocument();
      expect(screen.getByText('일반회원이영희')).toBeInTheDocument();
    });

    it('shows tab switcher for owner (manager+)', () => {
      render(<TeamMembersPage />);

      expect(screen.getByTestId('tab-members')).toBeInTheDocument();
      expect(screen.getByTestId('tab-applicants')).toBeInTheDocument();
    });

    it('does NOT show tab switcher for regular member', () => {
      mockUseAuthStore.mockReturnValue({ user: { id: 'regular-user-id' } });

      render(<TeamMembersPage />);

      expect(screen.queryByTestId('tab-members')).toBeNull();
      expect(screen.queryByTestId('tab-applicants')).toBeNull();
    });
  });

  describe('applicants tab', () => {
    it('renders applicant section when owner clicks 신청자 tab', async () => {
      const user = userEvent.setup();
      render(<TeamMembersPage />);

      await user.click(screen.getByTestId('tab-applicants'));

      expect(screen.getByTestId('applicant-row-applicant-user-id')).toBeInTheDocument();
      expect(screen.getByText('신청자박지훈')).toBeInTheDocument();
    });

    it('shows accept and reject buttons in applicant row', async () => {
      const user = userEvent.setup();
      render(<TeamMembersPage />);

      await user.click(screen.getByTestId('tab-applicants'));

      expect(screen.getByTestId('applicant-accept-applicant-user-id')).toBeInTheDocument();
      expect(screen.getByTestId('applicant-reject-applicant-user-id')).toBeInTheDocument();
    });

    it('shows profile and chat buttons in applicant row', async () => {
      const user = userEvent.setup();
      render(<TeamMembersPage />);

      await user.click(screen.getByTestId('tab-applicants'));

      expect(screen.getByTestId('applicant-profile-applicant-user-id')).toBeInTheDocument();
      expect(screen.getByTestId('applicant-chat-applicant-user-id')).toBeInTheDocument();
    });

    it('calls acceptMutation when 수락 button is clicked', async () => {
      const user = userEvent.setup();
      const acceptMutate = vi.fn();
      mockUseAcceptTeamApplication.mockReturnValue({ mutate: acceptMutate, isPending: false });

      render(<TeamMembersPage />);
      await user.click(screen.getByTestId('tab-applicants'));
      await user.click(screen.getByTestId('applicant-accept-applicant-user-id'));

      expect(acceptMutate).toHaveBeenCalledWith(
        { teamId: 'team-abc', applicantUserId: 'applicant-user-id' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('calls rejectMutation when 거부 button is clicked', async () => {
      const user = userEvent.setup();
      const rejectMutate = vi.fn();
      mockUseRejectTeamApplication.mockReturnValue({ mutate: rejectMutate, isPending: false });

      render(<TeamMembersPage />);
      await user.click(screen.getByTestId('tab-applicants'));
      await user.click(screen.getByTestId('applicant-reject-applicant-user-id'));

      expect(rejectMutate).toHaveBeenCalledWith(
        { teamId: 'team-abc', applicantUserId: 'applicant-user-id' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('navigates to /users/:id when profile button is clicked', async () => {
      const user = userEvent.setup();
      render(<TeamMembersPage />);

      await user.click(screen.getByTestId('tab-applicants'));
      await user.click(screen.getByTestId('applicant-profile-applicant-user-id'));

      expect(mockPush).toHaveBeenCalledWith('/users/applicant-user-id');
    });

    it('calls startDirectChat when 채팅 button is clicked', async () => {
      const user = userEvent.setup();
      const chatMutate = vi.fn();
      mockUseStartDirectChat.mockReturnValue({ mutate: chatMutate, isPending: false });

      render(<TeamMembersPage />);
      await user.click(screen.getByTestId('tab-applicants'));
      await user.click(screen.getByTestId('applicant-chat-applicant-user-id'));

      expect(chatMutate).toHaveBeenCalledWith(
        { withUserId: 'applicant-user-id' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('shows empty state when no applications', async () => {
      const user = userEvent.setup();
      mockUseTeamApplications.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      render(<TeamMembersPage />);
      await user.click(screen.getByTestId('tab-applicants'));

      expect(screen.getByText('신청자가 아직 없어요')).toBeInTheDocument();
    });

    it('applicants tab badge shows count when there are pending applications', () => {
      render(<TeamMembersPage />);

      // The badge "1" should appear in the tab
      const tabButton = screen.getByTestId('tab-applicants');
      expect(tabButton).toHaveTextContent('1');
    });
  });

  describe('deep-link ?tab=applicants', () => {
    it('renders applicants tab as active on mount when URL has ?tab=applicants', () => {
      // Override useSearchParams to simulate a deep-link URL: ?tab=applicants
      vi.mocked(useSearchParams).mockReturnValueOnce({
        get: (k: string) => (k === 'tab' ? 'applicants' : null),
      } as any);

      // Use a manager role so the applicants tab is visible
      mockUseAuthStore.mockReturnValue({ user: { id: 'owner-user-id' } });

      render(<TeamMembersPage />);

      // The applicants tab should exist and be styled as active (bg-white / shadow-sm class)
      const applicantsTab = screen.getByTestId('tab-applicants');
      expect(applicantsTab).toBeInTheDocument();
      expect(applicantsTab.className).toContain('bg-white');

      // Applicant content must already be visible without a click
      expect(screen.getByTestId('applicant-row-applicant-user-id')).toBeInTheDocument();
    });
  });
});
