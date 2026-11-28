import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { createTournamentInfoServer } from '@/test/msw/tournament-info-handlers';
import type { V1Tournament } from '@/types/api';
import { TournamentInfoSection } from './info-section';
import { TOURNAMENT_INFO_SECTION_META, type TournamentInfoSectionKey } from './info-sections';
import { TournamentAdminProvider } from './tournament-admin-context';

// 주소를 실제 jsdom history 로 움직이는 라우터 — `?edit=` 로 여닫는 것과 뒤로가기를 함께 본다.
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  window.addEventListener('popstate', notify);
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const router = {
    replace: vi.fn((url: string) => {
      window.history.replaceState(window.history.state, '', url);
      notify();
    }),
    push: vi.fn(),
    back: vi.fn(),
  };
  return {
    usePathname: () => useSyncExternalStore(subscribe, () => window.location.pathname),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
    useRouter: () => router,
  };
});

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

const OVERVIEW = '/admin/tournaments/tournament-1';
const INFO = `${OVERVIEW}/info`;
const server = setupServer();
const showToast = vi.fn();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  showToast.mockReset();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', OVERVIEW);
  installNavigationHistory();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
});

/** 개요에서 대회 정보로 들어온 것처럼 항목을 하나 쌓고 그린다. */
async function renderPage({ canWrite = true, initial = {}, search = '' }: { canWrite?: boolean; initial?: Partial<V1Tournament>; search?: string } = {}) {
  const backend = createTournamentInfoServer(initial);
  server.use(...backend.handlers);
  window.history.pushState({}, '', `${INFO}${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TournamentAdminProvider value={{ tournamentId: 'tournament-1', role: canWrite ? 'PLATFORM_OPS' : 'SUPPORT_READONLY', canWrite, showToast }}>
        <TournamentInfoSection />
      </TournamentAdminProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('region', { name: '기본' });
  return { backend, ...view };
}
const sheetOf = (key: TournamentInfoSectionKey) => screen.findByRole('dialog', { name: TOURNAMENT_INFO_SECTION_META[key].title });
const noSheet = () => expect(screen.queryByRole('dialog')).toBeNull();

describe('대회 정보 — 섹션 요약 카드', () => {
  it('카드 여섯 장이 정해진 순서로 나오고, 카드마다 「수정」 이 하나다', async () => {
    await renderPage();

    expect(screen.getAllByRole('region').map((card) => card.getAttribute('aria-labelledby') && within(card).getByRole('heading', { level: 2 }).textContent)).toEqual([
      '기본', '일정·장소', '참가', '경기 규칙', '공개 화면', '홍보',
    ]);
    for (const title of ['기본', '일정·장소', '참가', '경기 규칙', '공개 화면', '홍보']) {
      expect(within(screen.getByRole('region', { name: title })).getAllByRole('button')).toHaveLength(1);
      expect(screen.getByRole('button', { name: `${title} 수정` })).toBeInTheDocument();
    }
  });

  it('쉬는 화면에는 입력칸이 하나도 없고, 섹션 바로가기 줄도 없다', async () => {
    const { container } = await renderPage();

    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(screen.queryByRole('navigation')).toBeNull();
    noSheet();
  });

  it('예전 편집 입구와 카드는 없다', async () => {
    const { container } = await renderPage();

    for (const name of ['대회 정보 수정', '홍보 카드 수정', '상금 정보 저장']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(container.textContent).not.toContain('피리어드');
    expect(container.textContent).not.toContain('롤링');
  });

  it('경기 시간과 출전 인원 요약은 서버 값이 도착하면 채워진다', async () => {
    await renderPage();
    const rules = within(screen.getByRole('region', { name: '경기 규칙' }));

    expect(await rules.findByText('전·후반 20분 / 20분')).toBeInTheDocument();
    await waitFor(() => expect(rules.getAllByText('종목 기본값')).toHaveLength(3));
  });
});

describe('대회 정보 — 채워야 할 것', () => {
  it('비어 있는 필요 항목을 세고, 버튼이 그 섹션 시트를 첫 빈칸에 초점을 둔 채 연다', async () => {
    await renderPage();
    const strip = within(screen.getByRole('status'));

    expect(strip.getByText('채워야 할 것 2')).toBeInTheDocument();
    expect(strip.getByText('장소·명단 제출 마감이 비어 있어요.')).toBeInTheDocument();
    fireEvent.click(strip.getByRole('button', { name: '장소·명단 제출 마감 입력하기' }));

    const sheet = within(await sheetOf('schedule'));
    expect(currentPath()).toBe(`${INFO}?edit=schedule`);
    expect(sheet.getByLabelText('장소')).toHaveFocus();
  });

  it('유료인데 계좌가 없으면 참가 섹션 버튼이 따로 생긴다', async () => {
    await renderPage({ initial: { entryFee: 30000 } });
    const strip = within(screen.getByRole('status'));

    expect(strip.getByText('채워야 할 것 3')).toBeInTheDocument();
    fireEvent.click(strip.getByRole('button', { name: '정산 계좌 입력하기' }));

    expect(within(await sheetOf('entry')).getByLabelText('계좌번호')).toHaveFocus();
  });

  it('대조군: 필요 항목이 다 채워졌으면 상자가 없다', async () => {
    await renderPage({ initial: { venue: '성수 풋살장', rosterDeadlineAt: '2026-12-18T14:59:00.000Z' } });

    expect(screen.queryByText(/채워야 할 것/)).toBeNull();
  });

  it('읽기 전용 역할에게는 상자에 버튼이 없다', async () => {
    await renderPage({ canWrite: false });

    expect(screen.getByText('채워야 할 것 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입력하기$/ })).toBeNull();
  });
});

describe('대회 정보 — ?edit= 로 여닫는 수정 시트', () => {
  it('?edit=schedule 로 들어오면 일정·장소 시트가 열리고 첫 빈칸(장소)에 초점이 간다', async () => {
    await renderPage({ search: '?edit=schedule' });

    expect(within(await sheetOf('schedule')).getByLabelText('장소')).toHaveFocus();
  });

  it.each(['?edit=foo', '?edit=BASIC', '?edit='])('%s 는 시트를 열지 않고 화면도 그대로다', async (search) => {
    await renderPage({ search });

    noSheet();
    expect(screen.getAllByRole('region')).toHaveLength(6);
  });

  it('읽기 전용 역할은 ?edit=rules 로 들어와도 시트도 수정 버튼도 없다', async () => {
    await renderPage({ canWrite: false, search: '?edit=rules' });

    noSheet();
    expect(screen.queryByRole('button', { name: /수정$/ })).toBeNull();
  });

  it('「수정」 은 주소에 edit 을 넣어 시트를 열고, 닫으면 edit 만 지운다', async () => {
    await renderPage({ search: '?from=overview' });

    fireEvent.click(screen.getByRole('button', { name: '참가 수정' }));
    const sheet = await sheetOf('entry');
    expect(currentPath()).toBe(`${INFO}?from=overview&edit=entry`);

    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(currentPath()).toBe(`${INFO}?from=overview`));
    noSheet();
  });

  it('닫은 뒤의 뒤로가기는 시트를 다시 열지 않고 들어오기 전 화면으로 간다', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: '기본 수정' }));
    fireEvent.click(within(await sheetOf('basic')).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(currentPath()).toBe(INFO));

    await act(async () => {
      window.history.back();
      await settleHistory();
    });

    expect(currentPath()).toBe(OVERVIEW);
    noSheet();
  });

  it('열린 시트에서 뒤로가기를 누르면 시트만 닫히고 주소에서 edit 이 지워진다', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: '기본 수정' }));
    await sheetOf('basic');

    await act(async () => {
      window.history.back();
      await settleHistory();
    });

    await waitFor(() => noSheet());
    expect(currentPath()).toBe(INFO);
  });

  it('저장하면 시트가 닫히고 카드 요약이 새 값으로 바뀐다', async () => {
    const { backend } = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: '기본 수정' }));
    const sheet = within(await sheetOf('basic'));

    fireEvent.change(sheet.getByLabelText(/^대회명/), { target: { value: '겨울 풋살컵' } });
    fireEvent.click(sheet.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('기본 설정을 저장했어요.', 'success'));
    await waitFor(() => noSheet());
    expect(await within(screen.getByRole('region', { name: '기본' })).findByText('겨울 풋살컵')).toBeInTheDocument();
    expect(backend.state.patches).toHaveLength(1);
    await waitFor(() => expect(currentPath()).toBe(INFO));
  });

  it('대진이 있어 잠긴 진행 방식은 요약 줄과 기본 시트 양쪽에서 잠겨 있다', async () => {
    const reason = '조나 대진이 만들어져 있어요. 경기와 조를 모두 삭제한 뒤 변경해 주세요.';
    await renderPage({ initial: { formatChangeBlockedReason: reason }, search: '?edit=basic' });
    const sheet = within(await sheetOf('basic'));

    expect(within(screen.getByRole('region', { name: '기본' })).getByText(reason)).toBeInTheDocument();
    expect(sheet.getByLabelText('진행 방식')).toBeDisabled();
  });
});

describe('대회 정보 — 예전 수정 창의 칸이 옮겨 간 곳', () => {
  const moved: Array<[TournamentInfoSectionKey, string]> = [
    ['basic', '종목'], ['basic', '대회명'], ['basic', '진행 방식'], ['basic', '성별'],
    ['schedule', '대회 시작'], ['schedule', '대회 종료'], ['schedule', '신청 마감'], ['schedule', '명단 제출 마감'], ['schedule', '장소'], ['schedule', '주차 안내'],
    ['entry', '팀 수'], ['entry', '명단 인원'], ['entry', '참가비'], ['entry', '은행명'], ['entry', '계좌번호'], ['entry', '예금주'],
    ['rules', '출전 인원'], ['rules', '경기 시간'], ['rules', '교체'], ['rules', '순위 정하는 순서'], ['rules', '경고 누적 출전정지'], ['rules', '퇴장 출전정지'], ['rules', '팀 파울 기준'],
    ['public', '목록 이미지'], ['public', '상세 이미지 표시'], ['public', '총상금'], ['public', '상금과 시상 요약'], ['public', '대회 규정'], ['public', '환불 정책'],
    ['promo', '홈 오늘의 추천'], ['promo', '대회 목록 상단'],
  ];

  it.each(moved)('%s 시트에 「%s」 가 있다', async (section, label) => {
    await renderPage({ search: `?edit=${section}` });
    const sheet = within(await sheetOf(section));

    // 칸의 이름은 label·fieldset·묶음 제목·버튼 줄 가운데 하나로 붙어 있다.
    await waitFor(() => {
      const found =
        sheet.queryAllByLabelText(label, { exact: true }).length +
        sheet.queryAllByText(label, { exact: true }).length +
        sheet.queryAllByRole('group', { name: label }).length;
      expect(found).toBeGreaterThan(0);
    });
  });

  it('조건이 맞는 대회에만 나오는 칸: 리그전의 팀당 최소 경기 수, 혼성의 혼성 쿼터, 6팀 토너먼트의 6강 방식', async () => {
    await renderPage({ initial: { format: 'league', genderCategory: 'mixed' }, search: '?edit=entry' });
    const entry = within(await sheetOf('entry'));
    expect(entry.getByLabelText('팀당 최소 경기 수')).toBeInTheDocument();
    expect(entry.getByRole('switch', { name: '혼성 쿼터' })).toBeInTheDocument();
    cleanup();

    await renderPage({ initial: { format: 'knockout', teamCount: 6 }, search: '?edit=rules' });
    expect(await within(await sheetOf('rules')).findByLabelText('6팀 토너먼트 진행')).toBeInTheDocument();
  });
});
