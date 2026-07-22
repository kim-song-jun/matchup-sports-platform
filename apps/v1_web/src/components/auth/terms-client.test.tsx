import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TermsClient } from './terms-client';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  completeSocialTermsMutate: vi.fn(),
  acceptSignupTermsMutate: vi.fn(),
}));

const SERVICE_DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const NEW_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const OPTIONAL_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

function currentTerms(renewal = false) {
  return {
    ready: true,
    items: [
      {
        documentId: SERVICE_DOCUMENT_ID,
        title: '서비스 이용약관',
        version: 'v1.1',
        content: '기존 약관 본문',
        subtitle: '팀밋 서비스 이용을 위한 기본 약관이에요.',
        changeSummary: null,
        requirement: 'required',
        accepted: renewal,
        requiresAction: false,
      },
      {
        documentId: NEW_DOCUMENT_ID,
        title: '신규 필수 약관',
        version: 'v1.1',
        content: '신규 약관 본문',
        subtitle: '새로 적용되는 필수 기준',
        changeSummary: '신규 필수 항목',
        requirement: 'required',
        accepted: false,
        requiresAction: renewal,
      },
      {
        documentId: OPTIONAL_DOCUMENT_ID,
        title: '위치기반서비스 이용 동의',
        version: 'v1.1',
        content: '선택 약관 본문',
        subtitle: '선택 · 주변 매치 추천에 사용되는 동의예요.',
        changeSummary: '주변 경기 추천을 위한 선택 동의',
        requirement: 'optional',
        accepted: false,
        requiresAction: false,
      },
    ],
  };
}

let currentTermsValue = currentTerms();

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
  useV1AcceptSignupTerms: () => ({
    mutate: hooks.acceptSignupTermsMutate,
    isPending: false,
  }),
  useV1CurrentSignupTerms: () => ({
    data: currentTermsValue,
    isPending: false,
    isError: false,
  }),
  useV1CurrentTerms: () => ({
    data: undefined,
    isPending: false,
    isError: false,
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
    currentTermsValue = currentTerms();
    hooks.completeSocialTermsMutate.mockImplementation(
      (_body: { readonly requiredTermsAccepted: boolean; readonly acceptedTermsDocumentIds: string[] }, callbacks: SocialTermsCallbacks) =>
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
    currentTermsValue = currentTerms();
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

  it('renders a signup optional policy as a selectable card and stores it only when checked', async () => {
    render(<TermsClient />);

    const optionalTitle = screen.getByText(/위치기반서비스 이용 동의/);
    const optionalCard = optionalTitle.closest('.tm-auth-agreement-card');
    expect(optionalCard).toBeInTheDocument();
    expect(optionalCard).toHaveTextContent('선택');
    expect(screen.getByText('선택 · 주변 매치 추천에 사용되는 동의예요.')).toHaveClass('tm-text-label');
    expect(screen.queryByText(/회원가입 동의로 저장하지 않으며/)).not.toBeInTheDocument();

    fireEvent.click(optionalTitle);
    fireEvent.click(screen.getByRole('button', { name: /필수 약관 전체 동의/ }));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 회원가입하기' }));

    expect(JSON.parse(
      window.sessionStorage.getItem('teameet.v1.signupTermsDocumentIds') ?? '[]',
    )).toEqual([
      SERVICE_DOCUMENT_ID,
      NEW_DOCUMENT_ID,
      OPTIONAL_DOCUMENT_ID,
    ]);
  });

  it('renders the final required-consent summary copy', () => {
    render(<TermsClient />);

    expect(screen.getByText(
      '서비스 이용약관, 개인정보 수집 및 이용 동의에 모두 동의합니다.',
    )).toHaveClass('tm-text-caption');
  });
});

describe('TermsClient existing-user renewal contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTermsValue = currentTerms(true);
    searchParamsValue = new URLSearchParams('mode=renewal&redirect=%2Fmy');
    hooks.acceptSignupTermsMutate.mockImplementation(
      (_body: { documentIds: string[] }, callbacks: { onSuccess: () => void }) => callbacks.onSuccess(),
    );
  });

  it('keeps prior consent checked and submits only the newly required document', async () => {
    render(<TermsClient />);

    expect(screen.getByText('서비스 이용약관 (필수)').closest('.tm-auth-agreement-card'))
      .toHaveTextContent('동의 완료');
    expect(screen.getByText(/신규 필수 약관/).closest('.tm-auth-agreement-card'))
      .toHaveTextContent('새 동의 필요');

    fireEvent.click(screen.getByText(/신규 필수 약관/));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 계속하기' }));

    await waitFor(() => expect(hooks.acceptSignupTermsMutate).toHaveBeenCalledWith(
      { documentIds: [NEW_DOCUMENT_ID] },
      expect.any(Object),
    ));
    expect(router.replace).toHaveBeenCalledWith('/my');
  });

  it('returns without writing when every current required document is already accepted', async () => {
    currentTermsValue = {
      ...currentTermsValue,
      items: currentTermsValue.items.map((item) => ({
        ...item,
        accepted: true,
        requiresAction: false,
      })),
    };

    render(<TermsClient />);
    fireEvent.click(screen.getByRole('button', { name: '동의하고 계속하기' }));

    expect(hooks.acceptSignupTermsMutate).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/my');
  });

  it('keeps the mandatory renewal route active when browser back is requested', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<TermsClient />);
    const beforeBack = pushState.mock.calls.length;

    fireEvent.popState(window);

    expect(pushState.mock.calls.length).toBeGreaterThan(beforeBack);
    expect(pushState).toHaveBeenLastCalledWith(
      { termsRenewal: true },
      '',
      window.location.href,
    );
  });
});
