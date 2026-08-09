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
  logoutMutateAsync: vi.fn(),
}));

// 화면이 react-query 를 직접 쓰는 곳은 '가입 그만두기'가 캐시를 비우는 경로뿐이라
// useQueryClient 만 대체한다(Provider 없이 렌더하기 위함).
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: vi.fn() }),
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
  // social 모드 상단의 '가입 그만두기'(로그아웃) 출구가 쓰는 훅.
  useV1Logout: () => ({ mutateAsync: hooks.logoutMutateAsync, isPending: false }),
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
    fireEvent.click(screen.getByRole('button', { name: /전체 동의/ }));
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
    // 이메일 가입 흐름은 /terms?mode=signup 으로 들어온다 — 쿼리 없는 /terms 는 이제
    // 읽으러 온 방문자의 이용약관 화면이다.
    searchParamsValue = new URLSearchParams('mode=signup');
    currentTermsValue = currentTerms();
  });

  it('tracks a sign_up_start event with method=email before continuing to the account form', async () => {
    // Given
    render(<TermsClient />);
    fireEvent.click(screen.getByRole('button', { name: /전체 동의/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /전체 동의/ }));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 회원가입하기' }));

    expect(JSON.parse(
      window.sessionStorage.getItem('teameet.v1.signupTermsDocumentIds') ?? '[]',
    )).toEqual([
      SERVICE_DOCUMENT_ID,
      NEW_DOCUMENT_ID,
      OPTIONAL_DOCUMENT_ID,
    ]);
  });

  it('renders the agree-all summary copy', () => {
    render(<TermsClient />);

    expect(screen.getByText(
      '선택 항목을 포함한 모든 약관에 동의합니다. 선택 항목은 따로 해제할 수 있어요.',
    )).toHaveClass('tm-text-caption');
  });

  // 전체 동의가 필수만 켜면 선택 항목을 일일이 눌러야 해 "전체"라는 이름과 어긋난다.
  it('전체 동의는 선택 항목까지 함께 켜고 제출에 포함한다', () => {
    render(<TermsClient />);

    fireEvent.click(screen.getByRole('button', { name: /전체 동의/ }));
    fireEvent.click(screen.getByRole('button', { name: '동의하고 회원가입하기' }));

    expect(JSON.parse(
      window.sessionStorage.getItem('teameet.v1.signupTermsDocumentIds') ?? '[]',
    )).toEqual([SERVICE_DOCUMENT_ID, NEW_DOCUMENT_ID, OPTIONAL_DOCUMENT_ID]);
  });

  // 선택은 어디까지나 선택 — 개별로 해제할 수 있어야 하고, 해제해도 가입은 막히지 않는다.
  it('전체 동의 후 선택 항목만 해제하면 제출에서 빠지고 가입은 계속 가능하다', async () => {
    render(<TermsClient />);

    fireEvent.click(screen.getByRole('button', { name: /전체 동의/ }));
    fireEvent.click(screen.getByText(/위치기반서비스 이용 동의/));

    const continueButton = screen.getByRole('button', { name: '동의하고 회원가입하기' });
    await waitFor(() => expect(continueButton).toBeEnabled());
    // 하나라도 빠졌으면 전체 동의 버튼도 꺼진 상태로 따라와야 실제 상태와 어긋나지 않는다.
    expect(screen.getByRole('button', { name: /전체 동의/ })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(continueButton);
    expect(JSON.parse(
      window.sessionStorage.getItem('teameet.v1.signupTermsDocumentIds') ?? '[]',
    )).toEqual([SERVICE_DOCUMENT_ID, NEW_DOCUMENT_ID]);
  });

  // 'v1 · 새 동의 필요' 같은 내부 표기는 사용자에게 의미가 없어 노출하지 않는다.
  it('문서 버전과 동의 상태 문구를 노출하지 않는다', () => {
    render(<TermsClient />);

    expect(screen.queryByText(/새 동의 필요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/동의 완료/)).not.toBeInTheDocument();
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

    // 상태는 '동의 완료'·'새 동의 필요' 문구가 아니라 체크박스로 드러난다 —
    // 이미 동의한 항목은 켜진 채 비활성, 새로 동의할 항목은 꺼진 채 활성이다.
    const acceptedCheck = screen.getByText('서비스 이용약관 (필수)')
      .closest('.tm-auth-agreement-card')!.querySelector('.tm-auth-check-button')!;
    expect(acceptedCheck).toBeDisabled();
    expect(acceptedCheck).toHaveAttribute('aria-pressed', 'true');

    const pendingCheck = screen.getByText(/신규 필수 약관/)
      .closest('.tm-auth-agreement-card')!.querySelector('.tm-auth-check-button')!;
    expect(pendingCheck).toBeEnabled();
    expect(pendingCheck).toHaveAttribute('aria-pressed', 'false');

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

/**
 * 쿼리 없는 /terms 는 외부 유입(북마크·검색엔진·공유 링크)의 도착지다. 예전에는 여기서
 * 가입 동의 게이트가 떠서 이용약관 본문에 도달할 방법이 없었다 — alpha 실측으로 본문
 * 290자(제1조 없음) vs `?document=terms` 1910자였다.
 *
 * 가입 진입은 ?mode=signup 으로 명시됐으므로, 아래 세 갈래가 서로를 침범하지 않아야 한다.
 */
describe('TermsClient entry routing contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    currentTermsValue = currentTerms();
  });

  it('shows the service terms document when /terms is opened with no query', () => {
    searchParamsValue = new URLSearchParams();

    render(<TermsClient />);

    expect(screen.getByRole('heading', { name: '서비스 이용약관' })).toBeInTheDocument();
    // 동의 게이트가 아니어야 한다 — 읽으러 온 사람에게 체크박스를 들이밀지 않는다.
    // '전체 동의'는 게이트가 렌더되면 동의 여부와 무관하게 항상 있는 컨트롤이다
    // (하단 CTA 라벨은 '필수 약관에 동의해 주세요' ↔ '동의하고 회원가입하기'로 바뀌어
    // 게이트 존재 여부를 판정하는 기준으로는 쓸 수 없다).
    expect(screen.queryByRole('button', { name: /전체 동의/ })).toBeNull();
  });

  it('still shows the consent gate for the signup entry', () => {
    searchParamsValue = new URLSearchParams('mode=signup');

    render(<TermsClient />);

    expect(screen.getByRole('button', { name: /전체 동의/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '서비스 이용약관' })).toBeNull();
  });

  it('keeps the re-consent gate on bare /terms for a non-compliant account', () => {
    // pending-social-signup-gate 는 /terms 에서 리다이렉트를 걸지 않는다(무한 루프 방지).
    // 그래서 재동의 대상은 쿼리가 없어도 이 화면이 직접 막아야 한다 — 여기서 본문을
    // 보여주면 재동의를 건너뛰게 된다.
    searchParamsValue = new URLSearchParams();
    currentTermsValue = { ...currentTerms(), compliance: { compliant: false } };

    render(<TermsClient />);

    expect(screen.queryByRole('heading', { name: '서비스 이용약관' })).toBeNull();
  });
});
