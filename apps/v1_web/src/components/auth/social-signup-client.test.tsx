import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialSignupClient } from './social-signup-client';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  checkNicknameMutate: vi.fn(),
  completeProfileMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CheckNickname: () => ({ mutate: hooks.checkNicknameMutate, isPending: false }),
  useV1CompleteSocialProfile: () => ({ mutate: hooks.completeProfileMutate, isPending: false }),
}));

type AvailabilityCallbacks = {
  readonly onSuccess: (result: { readonly available: boolean }) => void;
};

type CompleteProfileCallbacks = {
  readonly onSuccess: (result: {
    readonly session: { readonly userId: string; readonly userEmail: string | null };
    readonly next: { readonly route: string };
  }) => void;
};

async function verifyNicknameAndSelectGender(): Promise<void> {
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '카카오러너' } });
  fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
  fireEvent.click(screen.getByRole('radio', { name: '여' }));
  await waitFor(() => expect(screen.getByText('사용 가능한 닉네임이에요.')).toBeInTheDocument());
}

describe('SocialSignupClient required profile contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.checkNicknameMutate.mockImplementation(
      (_value: string, callbacks: AvailabilityCallbacks) => callbacks.onSuccess({ available: true }),
    );
  });

  it.each([
    ['display name', /^이름/],
    ['phone', /^휴대폰 번호/],
    ['birth date', /^생년월일/],
  ] as const)('renders a required %s input for social signup', (_field, label) => {
    // Given
    render(<SocialSignupClient />);

    // When
    const input = screen.getByLabelText(label);

    // Then
    expect(input).toBeRequired();
  });

  it('keeps social signup blocked while the required profile inputs are empty', async () => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();

    // When
    const submitButton = screen.getByRole('button', { name: /입력 확인 후 계속|운동 설정으로 계속/ });

    // Then
    expect(submitButton).toBeDisabled();
  });

  it('submits all four required profile values for social signup', async () => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });

    // When
    fireEvent.click(screen.getByRole('button', { name: '운동 설정으로 계속' }));

    // Then
    await waitFor(() =>
      expect(hooks.completeProfileMutate).toHaveBeenCalledWith(
        {
          nickname: '카카오러너',
          displayName: '김러너',
          phone: '01087654321',
          birthDate: '20000229',
          gender: 'female',
        },
        expect.any(Object),
      ),
    );
  });

  it('follows the exact API next route after social profile completion', async () => {
    // Given
    hooks.completeProfileMutate.mockImplementation(
      (_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({
        session: { userId: 'social-user', userEmail: null },
        next: { route: '/onboarding/region' },
      }),
    );
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });

    // When
    fireEvent.click(screen.getByRole('button', { name: '운동 설정으로 계속' }));

    // Then
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/region'));
  });

  it.each([
    ['phone', /^휴대폰 번호/, '010876543210'],
    ['phone', /^휴대폰 번호/, '0108765abcd'],
    ['birth date', /^생년월일/, '200002290'],
    ['birth date', /^생년월일/, '2000ab29'],
  ] as const)('blocks social signup when raw %s input is %s', async (_field, label, rawValue) => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: rawValue } });

    // When
    fireEvent.click(screen.getByRole('button', { name: /입력 확인 후 계속|운동 설정으로 계속/ }));

    // Then
    expect(hooks.completeProfileMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', /^휴대폰 번호/, '01087654321', '0', '010-8765-43210'],
    ['birth date', /^생년월일/, '20000229', '0', '2000-02-290'],
  ] as const)('retains an extra typed %s digit and disables social signup', async (_field, label, validValue, extraDigit, expectedValue) => {
    // Given
    const user = userEvent.setup();
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value: validValue } });

    // When
    await user.type(input, extraDigit);

    // Then
    expect(input).toHaveValue(expectedValue);
    expect(screen.getByRole('button', { name: /입력 확인 후 계속|운동 설정으로 계속/ })).toBeDisabled();
  });
});
