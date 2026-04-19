import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import NotificationsPage from './page';
import type { NotificationPreference } from '@/types/api';

const mockBack = vi.fn();
const mockPush = vi.fn();
const mockToast = vi.fn();
const mockMutate = vi.fn();
const mockRefetch = vi.fn();
const mockUseRequireAuth = vi.fn();
const mockUseNotificationPreferences = vi.fn();
const mockUseUpdateNotificationPreferences = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

vi.mock('@/hooks/use-require-auth', () => ({
  useRequireAuth: () => mockUseRequireAuth(),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('@/hooks/use-api', () => ({
  useNotificationPreferences: () => mockUseNotificationPreferences(),
  useUpdateNotificationPreferences: () => mockUseUpdateNotificationPreferences(),
}));

const basePreference: NotificationPreference = {
  id: 'pref-1',
  matchEnabled: true,
  teamEnabled: true,
  chatEnabled: true,
  paymentEnabled: true,
  teamApplicationEnabled: true,
  matchCompletedEnabled: true,
  eloChangedEnabled: true,
  chatMessageEnabled: true,
};

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    mockUseRequireAuth.mockReturnValue({ isAuthenticated: true });
    mockUseNotificationPreferences.mockReturnValue({
      isLoading: false,
      isError: false,
      data: basePreference,
      refetch: mockRefetch,
    });
    mockUseUpdateNotificationPreferences.mockReturnValue({
      isPending: false,
      mutate: mockMutate,
    });
  });

  it('renders server-synced, device-local, and unsupported sections separately', () => {
    render(<NotificationsPage />);

    expect(screen.getByText('계정 전체에 저장되는 알림')).toBeInTheDocument();
    expect(screen.getByText('세부 알림 타입')).toBeInTheDocument();
    expect(screen.getByText('이 기기에서만 적용되는 항목')).toBeInTheDocument();
    expect(screen.getByText('현재 지원하지 않는 범위')).toBeInTheDocument();
    expect(
      screen.getByText(/이메일 알림, 마케팅 수신, 전체 마스터 토글은 아직 서버 저장 계약이 없습니다/),
    ).toBeInTheDocument();
  });

  it('renders all 8 server-synced toggles', () => {
    render(<NotificationsPage />);

    // Category toggles (4)
    expect(screen.getByRole('switch', { name: '매치 알림 켜짐' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '팀 알림 켜짐' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '채팅 알림 켜짐' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '결제 알림 켜짐' })).toBeInTheDocument();
    // Detail toggles (4)
    expect(screen.getByRole('switch', { name: '팀 가입 신청 켜짐' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '매치 종료 켜짐' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'ELO 변동 켜짐' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '채팅 메시지 켜짐' })).toBeInTheDocument();
  });

  it('calls mutate with eloChangedEnabled: false when ELO 변동 toggle is clicked', async () => {
    const user = userEvent.setup();

    render(<NotificationsPage />);

    await user.click(screen.getByRole('switch', { name: 'ELO 변동 켜짐' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { eloChangedEnabled: false },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
        onSettled: expect.any(Function),
      }),
    );
  });

  it('shows success toast after successful toggle save', async () => {
    const user = userEvent.setup();
    mockUseUpdateNotificationPreferences.mockReturnValue({
      isPending: false,
      mutate: vi.fn((_payload, callbacks) => {
        callbacks?.onSuccess?.();
      }),
    });

    render(<NotificationsPage />);

    await user.click(screen.getByRole('switch', { name: 'ELO 변동 켜짐' }));

    expect(mockToast).toHaveBeenCalledWith('success', '알림 설정이 계정에 저장되었어요');
  });

  it('returns null while redirecting unauthenticated users instead of showing an error state', () => {
    mockUseRequireAuth.mockReturnValue({ isAuthenticated: false });
    mockUseNotificationPreferences.mockReturnValue({
      isLoading: false,
      isError: false,
      data: undefined,
      refetch: mockRefetch,
    });

    const { container } = render(<NotificationsPage />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('알림 설정을 불러오지 못했어요')).not.toBeInTheDocument();
  });

  it('sends a partial payload when a server-synced category is toggled', async () => {
    const user = userEvent.setup();

    render(<NotificationsPage />);

    await user.click(screen.getByRole('switch', { name: '채팅 알림 켜짐' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { chatEnabled: false },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
        onSettled: expect.any(Function),
      }),
    );
  });

  it('persists device-local dnd preference to localStorage', async () => {
    const user = userEvent.setup();

    render(<NotificationsPage />);

    await user.click(screen.getByRole('switch', { name: '방해금지 시간 꺼짐' }));

    expect(localStorage.getItem('teameet:notification-dnd-enabled')).toBe('true');
    expect(mockToast).toHaveBeenCalledWith('success', '이 기기에서 방해금지 시간을 켰어요');
  });
});
