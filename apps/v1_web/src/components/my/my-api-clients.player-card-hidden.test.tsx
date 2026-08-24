import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlayerCardHiddenSettingsPageClient } from './my-api-clients';

/**
 * 선수 카드 숨김 설정 (Task 155).
 *
 * 이 화면이 없을 때 컬럼(`playerCardHidden`)은 **읽히기만 하고 켤 수 없었다.**
 * 게임화에 거부감이 있는 사용자를 위한 탈출구가 목적인데 잠글 방법이 없으면 탈출구가
 * 아니다. 그래서 여기서 거는 것은 "토글이 실제로 서버에 반대값을 보내는가"와
 * "화면이 지금 상태를 정직하게 말하는가" 두 가지다.
 */

// AppChrome 이 next/navigation 을 쓴다 -- theme 설정 테스트와 같은 패턴.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const stateMock = vi.fn();
const mutateMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/hooks/use-v1-api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-v1-api');
  return {
    ...actual,
    useV1PlayerCardHidden: () => stateMock(),
    useV1UpdatePlayerCardHidden: () => updateMock(),
  };
});

// 이 화면은 react-query 훅을 쓰므로 Provider 없이는 렌더 자체가 안 된다.
function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mutateMock.mockReset();
  updateMock.mockReturnValue({ mutate: mutateMock, isPending: false });
});

describe('선수 카드 숨김 설정', () => {
  it('꺼져 있으면 지금 보인다고 말하고, 누르면 숨김을 켠다', async () => {
    stateMock.mockReturnValue({ data: { hidden: false }, isLoading: false, isError: false });

    renderWithClient(<PlayerCardHiddenSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '선수 카드 숨기기' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/지금은 카드가 보여요/)).toBeInTheDocument();

    fireEvent.click(toggle);

    // 반대값을 보내야 한다 -- 같은 값을 보내면 아무 일도 일어나지 않는다.
    await waitFor(() => expect(mutateMock).toHaveBeenCalledWith({ hidden: true }, expect.anything()));
  });

  it('켜져 있으면 지금 숨겨졌다고 말하고, 누르면 다시 보이게 한다', async () => {
    stateMock.mockReturnValue({ data: { hidden: true }, isLoading: false, isError: false });

    renderWithClient(<PlayerCardHiddenSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '선수 카드 숨기기' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/지금은 카드가 보이지 않아요/)).toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() => expect(mutateMock).toHaveBeenCalledWith({ hidden: false }, expect.anything()));
  });

  it('카드만 끄는 것이지 프로필을 숨기는 게 아니라는 것을 화면에 적는다', () => {
    stateMock.mockReturnValue({ data: { hidden: false }, isLoading: false, isError: false });

    renderWithClient(<PlayerCardHiddenSettingsPageClient />);

    // 이 문장이 없으면 "프로필이 통째로 숨겨진다"로 오해하고 켜지 못한다.
    expect(screen.getByText(/활동 기록과 프로필은 그대로 남아요/)).toBeInTheDocument();
  });

  it('저장에 실패하면 조용히 넘어가지 않고 화면에 말한다', async () => {
    stateMock.mockReturnValue({ data: { hidden: false }, isLoading: false, isError: false });
    mutateMock.mockImplementation((_body, options) => options?.onError?.(new Error('boom')));

    renderWithClient(<PlayerCardHiddenSettingsPageClient />);
    fireEvent.click(screen.getByRole('switch', { name: '선수 카드 숨기기' }));

    expect(await screen.findByText('저장하지 못했어요')).toBeInTheDocument();
  });

  it('조회 자체가 실패하면 재시도를 준다', () => {
    const refetch = vi.fn();
    stateMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    renderWithClient(<PlayerCardHiddenSettingsPageClient />);

    expect(screen.getByText(/설정을 불러오지 못했어요/)).toBeInTheDocument();
  });
});
