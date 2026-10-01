import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShellOverrideForRoute } from '@/components/v1-ui/shell-override';
import { RecordConsentSettingsPageClient } from './my-api-clients';

// F2: 사용자 단위 공개 기록 동의 토글 — 켜면 과거 경기까지 소급 공개된다는 게 이 기능의
// 핵심 조건이라(사용자 명시 결정) 문구·mutation payload 둘 다 이 사실을 실제로 반영하는지
// 검증한다("이 테스트가 깨지면 실제 버그를 잡는가" 게이트).
const hooks = vi.hoisted(() => ({
  consent: vi.fn(),
  updateConsent: vi.fn(),
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => hooks.searchParams(),
  usePathname: () => '/my/settings/record-consent',
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1RecordConsent: hooks.consent,
    useV1UpdateRecordConsent: hooks.updateConsent,
  };
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RecordConsentSettingsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('꺼져 있으면 비공개로 보이고, 소급 공개를 미리 알린다', () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '경기 기록 공개' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('지금은 비공개예요.')).toBeInTheDocument();
    // 켜기 전에도 소급 공개 사실을 알아야 한다 — 켜고 나서 놀라지 않게.
    expect(screen.getByText(/켜면 지금까지 참가한 경기 기록도 함께 공개되고/)).toBeInTheDocument();
  });

  it('토글을 누르면 granted:true + 고정 policyHash로 저장한다', async () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn();
    hooks.updateConsent.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    renderWithClient(<RecordConsentSettingsPageClient />);
    await user.click(screen.getByRole('switch', { name: '경기 기록 공개' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { granted: true, policyHash: 'v1-public-record-consent-1' },
      expect.any(Object),
    );
  });

  it('켜져 있으면 공개 중으로 보이고 언제부터 공개됐는지 알려준다', () => {
    hooks.consent.mockReturnValue({
      data: { granted: true, effectiveAt: '2026-08-01T00:00:00.000Z' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '경기 기록 공개' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    // 상태·시작 시점은 스위치 행 한 줄에만 나온다(ON 글자·날짜 줄을 따로 두지 않는다).
    expect(screen.getByText(/^공개 중 · 2026년 8월 1일.*부터$/)).toBeInTheDocument();
    expect(screen.queryByText('ON')).not.toBeInTheDocument();
    expect(screen.queryByText(/부터 공개하고 있어요/)).not.toBeInTheDocument();
    // 서버는 끄는 즉시 연결된 모든 기록을 비공개로 돌린다(새 경기부터가 아니다) -- 각주가 그 동작을 말한다.
    expect(screen.getByText(/끄면 바로 모두 비공개로 돌아가요/)).toBeInTheDocument();
    expect(screen.queryByText(/새 경기부터/)).not.toBeInTheDocument();
    // 활동 기록 KPI·득점 목록에는 도움도 나온다 -- 무엇이 공개되는지 말하는 각주가 빠뜨리면 안 된다.
    expect(screen.getByText(/득점, 도움, 경고·퇴장/)).toBeInTheDocument();
  });

  it('저장에 실패하면 조용히 넘어가지 않고 이유를 알린다', async () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn((_vars, options) => options?.onError?.(new Error('boom')));
    hooks.updateConsent.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    renderWithClient(<RecordConsentSettingsPageClient />);
    await user.click(screen.getByRole('switch', { name: '경기 기록 공개' }));

    expect(await screen.findByText('저장하지 못했어요')).toBeInTheDocument();
  });

  it('조회 자체가 실패하면 재시도 가능한 에러 화면을 보여준다', () => {
    const refetch = vi.fn();
    hooks.consent.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    expect(screen.getByText('설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '경기 기록 공개' })).not.toBeInTheDocument();
  });

  it('응답이 오기 전에는 OFF 토글을 그리지 않는다 (처음 답하는 화면으로 바뀔 때 깜빡이지 않게)', () => {
    hooks.consent.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('지금은 비공개예요.')).not.toBeInTheDocument();
  });

  it('데스크톱 뒤로가기는 ?from= 이 없으면 /my/settings 로 떨어진다', () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/my/settings');
  });

  it('데스크톱 뒤로가기는 ?from= 이 있으면 그 출처를 따라간다', () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });
    hooks.searchParams.mockReturnValueOnce(new URLSearchParams('from=%2Fhome'));

    renderWithClient(<RecordConsentSettingsPageClient />);

    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/home');
  });

  // 알림을 거치면 딥링크의 from=tournament 가 from=/notifications 로 바뀐다 — 대회 맥락은 tournamentId 로 남아야 한다.
  it('알림에서 들어오면 대회 맥락을 유지하고 뒤로가기는 알림으로 간다', () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });
    hooks.searchParams.mockReturnValue(new URLSearchParams('from=%2Fnotifications&tournamentId=t1'));

    renderWithClient(<RecordConsentSettingsPageClient />);

    expect(screen.getByText(/명단에 올랐어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/notifications');
    hooks.searchParams.mockReturnValue(new URLSearchParams());
  });

  it('설명 전용 카드 없이 분류 라벨 + 조작 카드 하나 + 각주로 보여준다 (P1 C안)', () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    const { container } = renderWithClient(<RecordConsentSettingsPageClient />);

    // 예전 설명 전용 카드 제목("공개되는 정보")은 사라지고 분류 라벨로 대체됐다.
    expect(screen.queryByText('공개되는 정보')).not.toBeInTheDocument();
    expect(screen.getByText('공개')).toBeInTheDocument();
    expect(container.querySelectorAll('.tm-card').length).toBe(1);
  });

  // 성공 분기는 자기 헤더를 그리므로 셸 헤더가 겹치지 않게 꺼야 하고, 로딩·에러는 셸 헤더가 유일한 헤더다.
  it.each([
    ['성공', { data: { granted: false, effectiveAt: null }, isLoading: false, isError: false }, false],
    ['로딩', { data: undefined, isLoading: true, isError: false }, undefined],
    ['에러', { data: undefined, isLoading: false, isError: true }, undefined],
  ])('데스크톱 셸 헤더 override: %s', (_name, state, expected) => {
    hooks.consent.mockReturnValue({ ...state, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    const { result } = renderHook(() => useShellOverrideForRoute('/my/settings/record-consent'));
    expect(result.current.desktopHead).toBe(expected);
  });
});
