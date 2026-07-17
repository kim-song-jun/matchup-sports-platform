import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileEditPageClient } from './my-api-clients';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  profile: vi.fn(),
  updateProfile: vi.fn(),
  uploadImages: vi.fn(),
  checkEmail: vi.fn(),
  checkNickname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Profile: hooks.profile,
    useV1UpdateProfile: hooks.updateProfile,
    useV1UploadImages: hooks.uploadImages,
    useV1CheckEmail: hooks.checkEmail,
    useV1CheckNickname: hooks.checkNickname,
  };
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ProfileEditPageClient query states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.updateProfile.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkEmail.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkNickname.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('shows a loading skeleton instead of a blank editable form', () => {
    hooks.profile.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderWithClient(<ProfileEditPageClient />);

    expect(document.querySelector('.tm-skeleton-page')).toBeInTheDocument();
    expect(document.querySelector('#v1-profile-edit-form')).not.toBeInTheDocument();
  });

  it('shows a retryable error instead of a blocked blank form', () => {
    const refetch = vi.fn();
    hooks.profile.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });

    renderWithClient(<ProfileEditPageClient />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(refetch).toHaveBeenCalledOnce();
    expect(document.querySelector('#v1-profile-edit-form')).not.toBeInTheDocument();
  });
});
