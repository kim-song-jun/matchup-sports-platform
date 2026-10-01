import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Put } from '@/lib/api-client';
import { ownerRecordItem, ownerRecordsResponse } from '@/components/public-game-records/user-records.fixtures';
import { RecordConsentSettingsPageClient } from './my-api-clients';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/my/settings/record-consent',
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get: vi.fn(), v1Put: vi.fn() };
});

const v1GetMock = vi.mocked(v1Get);
const v1PutMock = vi.mocked(v1Put);

function consent(overrides: Record<string, unknown> = {}) {
  return { granted: false, effectiveAt: null, hasResponded: false, pendingRecordCount: 2, ...overrides };
}

function stubNetwork(options: { consent?: unknown; records?: () => unknown } = {}) {
  v1GetMock.mockImplementation(async (path: string) => {
    if (path === '/me/record-consent') return (options.consent ?? consent()) as never;
    if (path === '/auth/me') return { user: { id: 'user-a' } } as never;
    if (path.startsWith('/users/user-a/records')) {
      const records = options.records ? options.records() : ownerRecordsResponse({ items: [ownerRecordItem(), ownerRecordItem({ id: 'record-2', goals: 0, assists: 0, result: 'LOST', officialAt: '2026-09-23T01:10:00.000Z' })] });
      if (records instanceof Error) throw records;
      return records as never;
    }
    throw new Error(`예상하지 못한 요청: ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RecordConsentSettingsPageClient />
    </QueryClientProvider>,
  );
}

describe('RecordConsentSettingsPageClient — 처음 답하는 화면', () => {
  afterEach(() => vi.clearAllMocks());

  it('공개될 실제 기록과 노출 위치를 먼저 보여 주고, 토글 대신 두 버튼으로 답하게 한다', async () => {
    stubNetwork();
    renderPage();

    expect(await screen.findByText('공개를 기다리는 기록 · 2경기')).toBeInTheDocument();
    // 내 기록 행마다 "나만 보여요" 가 붙는다 -- 지금은 남에게 안 보이는 기록이라는 사실.
    expect(await screen.findAllByText('나만 보여요')).toHaveLength(2);
    expect(screen.getAllByText('마포 FC vs 합정 유나이티드')).toHaveLength(2);
    expect(screen.getByText('1골 · 1도움 · 경고 0 · 퇴장 0')).toBeInTheDocument();
    expect(screen.getByText('0골 · 0도움 · 경고 0 · 퇴장 0')).toBeInTheDocument();

    const exposure = screen.getByText('공개하면 이렇게 보여요').closest('section') as HTMLElement;
    expect(within(exposure).getByText('리그·대회 득점·도움 순위')).toBeInTheDocument();
    expect(within(exposure).getByText('골잡이 · 1골 · 1도움')).toBeInTheDocument();
    expect(within(exposure).getByText('엔트리 1경기 · 1골 · 1도움')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '공개 안 함' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2경기 공개하기' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('언제든 설정에서 바꿀 수 있어요. 끄면 바로 모두 비공개로 돌아가요.')).toBeInTheDocument();
  });

  it('"공개하기"와 "공개 안 함" 모두 서버에 응답을 남기고, 답한 뒤에는 토글 화면으로 바뀐다', async () => {
    const user = userEvent.setup();
    stubNetwork();
    v1PutMock.mockImplementation(async (_path, body) => {
      const granted = (body as { granted: boolean }).granted;
      return consent({ granted, hasResponded: true, pendingRecordCount: granted ? 0 : 2 }) as never;
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '공개 안 함' }));

    // 응답이 없는 "그냥 나가기"와 달리 REVOKED 를 명시로 남긴다 -- 그래야 홈 배너가 영구히 꺼진다.
    await waitFor(() =>
      expect(v1PutMock).toHaveBeenCalledWith('/me/record-consent', { granted: false, policyHash: 'v1-public-record-consent-1' }),
    );
    const toggle = await screen.findByRole('switch', { name: '경기 기록 공개' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: /공개하기/ })).not.toBeInTheDocument();
  });

  it('공개하기는 granted:true 로 저장한다', async () => {
    const user = userEvent.setup();
    stubNetwork();
    v1PutMock.mockResolvedValue(consent({ granted: true, hasResponded: true, pendingRecordCount: 0, effectiveAt: '2026-09-30T02:00:00.000Z' }) as never);
    renderPage();

    await user.click(await screen.findByRole('button', { name: '2경기 공개하기' }));

    await waitFor(() =>
      expect(v1PutMock).toHaveBeenCalledWith('/me/record-consent', { granted: true, policyHash: 'v1-public-record-consent-1' }),
    );
    expect(await screen.findByRole('switch', { name: '경기 기록 공개' })).toHaveAttribute('aria-checked', 'true');
  });

  it('저장에 실패하면 이유를 알리고 버튼은 그대로 남는다', async () => {
    const user = userEvent.setup();
    stubNetwork();
    v1PutMock.mockRejectedValue(new Error('boom'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: '공개 안 함' }));

    expect(await screen.findByText('저장하지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2경기 공개하기' })).toBeEnabled();
  });

  it('순위에 오르지 않는 기록이면 순위 줄을 약속하지 않는다', async () => {
    stubNetwork({
      records: () => ownerRecordsResponse({
        items: [ownerRecordItem({ type: 'friendly', leagueId: null, leagueTitle: null })],
        summary: {
          ...ownerRecordsResponse().summary,
          byType: { ...ownerRecordsResponse().summary.byType, league: { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 }, friendly: { appearances: 1, goals: 1, assists: 1, yellowCards: 0, redCards: 0, mvpCount: 0 } },
        },
      }),
    });
    renderPage();

    await screen.findByText('공개하면 이렇게 보여요');
    expect(screen.queryByText('리그·대회 득점·도움 순위')).not.toBeInTheDocument();
    expect(screen.getByText('선수 활동 기록')).toBeInTheDocument();
  });

  it('보여 주지 못한 기록이 더 있으면 그 사실을 알린다', async () => {
    stubNetwork({
      consent: consent({ pendingRecordCount: 5 }),
      records: () => ownerRecordsResponse({ nextCursor: 'cursor-2' }),
    });
    renderPage();

    expect(await screen.findByText('공개를 기다리는 기록 · 5경기')).toBeInTheDocument();
    expect(await screen.findByText('최근 1경기만 보여드려요. 나머지 경기도 함께 공개돼요.')).toBeInTheDocument();
  });

  it('기록을 불러오지 못해도 답하는 길은 막지 않는다', async () => {
    stubNetwork({ records: () => new Error('network') });
    renderPage();

    expect(await screen.findByText('기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2경기 공개하기' })).toBeEnabled();
  });

  it('이미 답했거나 공개를 기다리는 기록이 없으면 예전 토글 화면 그대로다', async () => {
    stubNetwork({ consent: consent({ hasResponded: true }) });
    const answered = renderPage();
    expect(await screen.findByRole('switch', { name: '경기 기록 공개' })).toBeInTheDocument();
    expect(screen.queryByText(/공개를 기다리는 기록/)).not.toBeInTheDocument();
    answered.unmount();

    stubNetwork({ consent: consent({ pendingRecordCount: 0 }) });
    renderPage();
    expect(await screen.findByRole('switch', { name: '경기 기록 공개' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공개 안 함' })).not.toBeInTheDocument();
  });
});
