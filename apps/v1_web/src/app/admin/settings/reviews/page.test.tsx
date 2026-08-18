/**
 * page.test.tsx (admin review policy settings)
 *
 * 이 화면의 실제 계약을 고정한다: 저장 버튼은 (a) 값이 범위 안이고 (b) 현재 설정과 다를 때만
 * 눌린다. 프리셋 버튼은 입력칸을 바꾸며, 저장 페이로드는 시간 단위 정수여야 한다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminMe,
  useV1AdminReviewPolicySettings,
  useV1UpdateReviewPolicySettings,
} from '@/hooks/use-v1-api';
import AdminReviewPolicySettingsPage from './page';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminMe: vi.fn(),
  useV1AdminReviewPolicySettings: vi.fn(),
  useV1UpdateReviewPolicySettings: vi.fn(),
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup);
const useV1AdminMeMock = vi.mocked(useV1AdminMe);
const useSettingsMock = vi.mocked(useV1AdminReviewPolicySettings);
const useUpdateMock = vi.mocked(useV1UpdateReviewPolicySettings);

function renderPage() {
  return render(
    <Providers>
      <AdminReviewPolicySettingsPage />
    </Providers>,
  );
}

describe('AdminReviewPolicySettingsPage', () => {
  const mutate = vi.fn();

  beforeEach(() => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useV1ActivePopup>);
    useV1AdminMeMock.mockReturnValue({
      data: { capabilities: ['status:write'] },
    } as unknown as ReturnType<typeof useV1AdminMe>);
    useSettingsMock.mockReturnValue({
      data: {
        reviewWindowHours: 168,
        reviewWindowLabel: '7일',
        minHours: 1,
        maxHours: 8760,
        defaultHours: 168,
        isDefault: false,
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminReviewPolicySettings>);
    useUpdateMock.mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
      typeof useV1UpdateReviewPolicySettings
    >);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('현재 설정을 사람이 읽는 문구와 시간 값으로 함께 보여준다', () => {
    renderPage();
    expect(screen.getByText(/현재 설정:/)).toHaveTextContent('7일');
    expect(screen.getByText(/현재 설정:/)).toHaveTextContent('168시간');
  });

  it('현재 값과 같으면 저장 버튼이 비활성이다', () => {
    renderPage();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('프리셋을 고르면 입력칸이 바뀌고 저장이 열린다', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '14일' }));
    expect(screen.getByLabelText('직접 입력 (시간)')).toHaveValue(336);
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });

  it('저장하면 시간 단위 정수를 그대로 보낸다', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('직접 입력 (시간)'), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(mutate).toHaveBeenCalledWith({ reviewWindowHours: 72 }, expect.anything());
  });

  it('허용 범위를 벗어나면 저장이 막히고 안내 문구가 뜬다', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('직접 입력 (시간)'), { target: { value: '99999' } });
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByText(/1~8760시간 사이의 정수로 입력해주세요/)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('쓰기 권한이 없으면 입력과 저장이 모두 잠긴다', () => {
    useV1AdminMeMock.mockReturnValue({ data: { capabilities: [] } } as unknown as ReturnType<typeof useV1AdminMe>);
    renderPage();
    expect(screen.getByLabelText('직접 입력 (시간)')).toBeDisabled();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByText('이 설정을 바꾸려면 쓰기 권한이 필요해요.')).toBeInTheDocument();
  });
});
