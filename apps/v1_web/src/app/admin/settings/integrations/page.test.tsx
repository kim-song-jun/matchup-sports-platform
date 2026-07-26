/**
 * page.test.tsx (admin integration settings)
 *
 * Regression coverage for the key-deletion flow: the payload must distinguish
 * "untouched" (undefined, don't send) from "delete" (empty string, send it) — a plain
 * `useState('')` collapses both into the same falsy value and a truthy payload check
 * silently drops the deletion. See Copilot PR #53 finding on this page.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AdminIntegrationSettings,
  useV1AdminMe,
  useV1UpdateIntegrationSettings,
} from '@/hooks/use-v1-api';
import AdminIntegrationSettingsPage from './page';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1AdminIntegrationSettings: vi.fn(),
  useV1AdminMe: vi.fn(),
  useV1UpdateIntegrationSettings: vi.fn(),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup);
const useV1AdminIntegrationSettingsMock = vi.mocked(useV1AdminIntegrationSettings);
const useV1AdminMeMock = vi.mocked(useV1AdminMe);
const useV1UpdateIntegrationSettingsMock = vi.mocked(useV1UpdateIntegrationSettings);

function renderPage() {
  return render(
    <Providers>
      <AdminIntegrationSettingsPage />
    </Providers>,
  );
}

describe('AdminIntegrationSettingsPage', () => {
  const mutate = vi.fn();

  beforeEach(() => {
    useV1ActivePopupMock.mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useV1ActivePopup>);
    useV1AdminMeMock.mockReturnValue({
      data: { capabilities: ['status:write'] },
    } as unknown as ReturnType<typeof useV1AdminMe>);
    useV1AdminIntegrationSettingsMock.mockReturnValue({
      data: {
        kakaoRestApiKey: '••••1234',
        kakaoRestApiKeySource: 'admin',
        kakaoMapsJsKey: null,
        kakaoMapsJsKeySource: 'env',
        updatedAt: '2026-07-14T00:00:00.000Z',
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminIntegrationSettings>);
    useV1UpdateIntegrationSettingsMock.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1UpdateIntegrationSettings>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a delete action only for a key that is actually admin-set (source: "admin")', () => {
    renderPage();

    // REST key source is 'admin' → deletable.
    expect(screen.getByRole('button', { name: /이 키 삭제/ })).toBeInTheDocument();
    // JS key source is 'env' → nothing stored in DB to delete, so no delete action.
    expect(screen.getAllByRole('button', { name: /이 키 삭제/ })).toHaveLength(1);
  });

  it('clicking delete then submitting sends an empty string for that field (not omitted)', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /이 키 삭제/ }));
    expect(screen.getByText(/삭제 예정/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const [payload] = mutate.mock.calls[0];
    expect(payload).toEqual({ kakaoRestApiKey: '' });
  });

  it('clicking "취소" after marking delete reverts to untouched — submitting sends nothing for that field', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /이 키 삭제/ }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    // No field touched anymore → submit is blocked with a validation toast, not sent as {}.
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('typing a new value takes precedence over payload omission (untouched → set)', async () => {
    renderPage();

    const jsKeyInput = screen.getByPlaceholderText('새 키 입력');
    fireEvent.change(jsKeyInput, { target: { value: 'new-js-key' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const [payload] = mutate.mock.calls[0];
    expect(payload).toEqual({ kakaoMapsJsKey: 'new-js-key' });
  });
});
