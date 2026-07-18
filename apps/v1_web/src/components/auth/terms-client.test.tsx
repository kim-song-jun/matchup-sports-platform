import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TermsClient } from './terms-client';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  completeSocialTermsMutate: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

let searchParamsValue = new URLSearchParams('mode=social');

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CompleteSocialTerms: () => ({
    mutate: hooks.completeSocialTermsMutate,
    isPending: false,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

type SocialTermsCallbacks = {
  readonly onSuccess: (result: {
    readonly next: { readonly route: string };
  }) => void;
};

describe('TermsClient social navigation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsValue = new URLSearchParams('mode=social');
    hooks.completeSocialTermsMutate.mockImplementation(
      (_body: { readonly requiredTermsAccepted: boolean }, callbacks: SocialTermsCallbacks) =>
        callbacks.onSuccess({ next: { route: '/signup/social' } }),
    );
  });

  it('follows the API next.route after social terms are accepted', async () => {
    // Given
    render(<TermsClient />);
    fireEvent.click(screen.getByRole('button', { name: /필수 약관 전체 동의/ }));
    const continueButton = screen.getByRole('button', { name: '동의하고 회원가입하기' });
    await waitFor(() => expect(continueButton).toBeEnabled());

    // When
    fireEvent.click(continueButton);

    // Then
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/social'));
  });
});

describe('TermsClient GA events (email signup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    searchParamsValue = new URLSearchParams();
  });

  it('tracks a sign_up_start event with method=email before continuing to the account form', async () => {
    // Given
    render(<TermsClient />);
    fireEvent.click(screen.getByRole('button', { name: /필수 약관 전체 동의/ }));
    const continueButton = screen.getByRole('button', { name: '동의하고 회원가입하기' });
    await waitFor(() => expect(continueButton).toBeEnabled());

    // When
    fireEvent.click(continueButton);

    // Then
    expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_start', { method: 'email' });
    expect(router.push).toHaveBeenCalledWith('/signup');
  });
});
