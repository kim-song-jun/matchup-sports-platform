import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENDER_CHOICE_OPTIONS } from '@/components/admin/tournaments/tournament-gender-choice-field';
import { stagePlanCounts } from '@/lib/stage-plan';
import { TOURNAMENT_FORMAT_NAMES } from '@/lib/tournament-format-labels';
import { server } from '@/test/msw/server';
import type { V1CreateTournamentPayload } from '@/types/api';
import { DEFAULT_GENDER_CATEGORY } from './create-form-model';
import AdminTournamentsNewPage from './page';

const routerPush = vi.fn();
const routerReplace = vi.fn();
let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/tournaments/new',
  useSearchParams: () => searchParamsValue,
}));

// jsdom 은 scrollIntoView 를 구현하지 않는다 — 불가피한 브라우저 API 스텁.
const originalScrollIntoView = Element.prototype.scrollIntoView;
const scrollIntoView = vi.fn();

const TIMESTAMP = '2026-11-27T00:00:00.000Z';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: TIMESTAMP }, { status: 201 });
const failure = (status: number, code: string, message: string) =>
  HttpResponse.json({ status: 'error', statusCode: status, code, message, details: null, requestId: 'req-1', timestamp: TIMESTAMP }, { status });

let posted: V1CreateTournamentPayload[] = [];
function useCreateHandler(respond: () => Response | Promise<Response> = () => success({ id: 't-1' })) {
  server.use(
    http.post('*/api/v1/admin/tournaments', async ({ request }) => {
      posted.push((await request.json()) as V1CreateTournamentPayload);
      return respond();
    }),
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  server.close();
});
beforeEach(() => {
  // 테스트 러너의 TZ 는 UTC — 입력값을 KST 로 읽는지까지 같이 본다.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-11-27T00:00:00+09:00');
  posted = [];
  searchParamsValue = new URLSearchParams();
  routerPush.mockReset();
  routerReplace.mockReset();
  scrollIntoView.mockReset();
  server.use(http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminTournamentsNewPage />
    </QueryClientProvider>,
  );
}

const field = (name: RegExp) => screen.getByLabelText(name);
const submitButton = () => screen.getByRole('button', { name: '초안 만들기' });
const barStatus = () => within(screen.getByRole('region', { name: '만들기' })).getByRole('status');
const sportGroup = () => screen.findByRole('radiogroup', { name: /종목/ });

async function pickSport(name = '풋살') {
  const group = await sportGroup();
  fireEvent.click(within(group).getByRole('radio', { name }));
}

async function fillRequired({ start = '2026-12-20T09:00' } = {}) {
  await pickSport();
  fireEvent.change(field(/대회명/), { target: { value: '  겨울컵 ' } });
  fireEvent.change(field(/대회 시작/), { target: { value: start } });
}

describe('대회 만들기 한 화면 폼', () => {
  it('필수 칸이 한 화면에 모두 있고, 마법사에 있던 입력은 없다', async () => {
    renderPage();
    const sports = await sportGroup();
    expect(within(sports).getAllByRole('radio')).toHaveLength(4);
    expect(within(sports).getAllByRole('radio')[0]).toHaveAttribute('id', 'create-sport');

    const formats = screen.getByRole('radiogroup', { name: /진행 방식/ });
    expect(within(formats).getAllByRole('radio')).toHaveLength(4);
    for (const name of Object.values(TOURNAMENT_FORMAT_NAMES)) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }

    expect(field(/대회명/)).toBeInTheDocument();
    expect(field(/대회 시작/)).toBeInTheDocument();
    expect(field(/신청 마감/)).toBeInTheDocument();
    expect(field(/팀 수/)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '성별' })).getAllByRole('radio')).toHaveLength(4);
    expect(submitButton()).toBeEnabled();

    expect(screen.queryByText(/STEP/)).toBeNull();
    expect(screen.queryByText(/단계 중/)).toBeNull();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
    for (const label of ['참가비', '은행명', '경기 시간', '출전 인원', '교체', '장소', '대회 종료', '명단 제출 마감']) {
      expect(screen.queryByLabelText(new RegExp(label))).toBeNull();
    }
    expect(screen.queryByText(/정규리그 \+ N개 토너먼트/)).toBeNull();
    expect(screen.queryByText(/대회 리그전/)).toBeNull();
    expect(screen.queryByRole('link', { name: /정규 리그 만들기/ })).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByText(/초안을 만든 뒤 「대회 정보」에서 채워요/)).toBeInTheDocument();
  });

  it('시작을 고르면 신청 마감을 3일 전 밤으로 채우고, 직접 고친 뒤에는 지킨다', async () => {
    renderPage();
    await sportGroup();
    fireEvent.change(field(/대회 시작/), { target: { value: '2026-12-20T09:00' } });
    expect(field(/신청 마감/)).toHaveValue('2026-12-17T23:59');
    expect(screen.getByText('시작 3일 전 밤으로 미리 채웠어요. 바꿔도 돼요.')).toBeInTheDocument();

    fireEvent.change(field(/신청 마감/), { target: { value: '2026-12-10T18:00' } });
    expect(screen.queryByText('시작 3일 전 밤으로 미리 채웠어요. 바꿔도 돼요.')).toBeNull();
    fireEvent.change(field(/대회 시작/), { target: { value: '2026-12-25T09:00' } });
    expect(field(/신청 마감/)).toHaveValue('2026-12-10T18:00');
  });

  it('시작이 3일 안쪽이면 마감을 비워 두고 주의를 보인다', async () => {
    renderPage();
    await sportGroup();
    fireEvent.change(field(/대회 시작/), { target: { value: '2026-11-29T09:00' } });
    expect(field(/신청 마감/)).toHaveValue('');
    expect(screen.getByText('대회가 곧 시작해서 미리 채우지 않았어요. 직접 정해 주세요.')).toBeInTheDocument();
  });

  it('팀 수는 스텝과 입력 모두 2~64 안에서 움직이고 진행 방식에 맞는 문장을 보인다', async () => {
    renderPage();
    await sportGroup();
    const count = field(/팀 수/);
    expect(count).toHaveValue('8');
    expect(screen.getByText('A·B조 4팀씩 → 4강 → 결승, 경기 15개로 치러요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '한 팀 늘리기' }));
    expect(count).toHaveValue('9');
    expect(screen.getByText('조 편성은 신청이 끝난 뒤 대진을 만들 때 정해요.')).toBeInTheDocument();

    fireEvent.change(count, { target: { value: '1a2' } });
    expect(count).toHaveValue('12');

    fireEvent.change(count, { target: { value: '2' } });
    expect(screen.getByRole('button', { name: '한 팀 줄이기' })).toBeDisabled();
    fireEvent.change(count, { target: { value: '64' } });
    expect(screen.getByRole('button', { name: '한 팀 늘리기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '한 팀 줄이기' })).toBeEnabled();

    fireEvent.change(count, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('radio', { name: TOURNAMENT_FORMAT_NAMES.league }));
    expect(screen.getByText('모든 팀이 한 번씩 겨뤄 경기 15개로 치러요.')).toBeInTheDocument();
  });

  it('빈 팀 수에서 스텝을 누르면 2로 시작한다', async () => {
    renderPage();
    await sportGroup();
    fireEvent.change(field(/팀 수/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '한 팀 늘리기' }));
    expect(field(/팀 수/)).toHaveValue('2');
  });

  it('채운 값을 서버 기본값을 덮지 않는 최소 필드로 보내고 개요로 이동한다 — 연달아 눌러도 한 번만', async () => {
    useCreateHandler(async () => {
      await delay(30);
      return success({ id: 't-1' });
    });
    renderPage();
    await fillRequired();
    const submit = submitButton();
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);
    expect(submit).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/admin/tournaments/t-1/overview?created=1'));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toStrictEqual({
      sportId: 'sport-futsal',
      title: '겨울컵',
      format: 'group_knockout',
      scheduledAt: '2026-12-20T00:00:00.000Z',
      registrationDeadlineAt: '2026-12-17T14:59:00.000Z',
      teamCount: 8,
    });
    // 이동하는 동안 다시 눌러 같은 대회를 또 만들 수 없다.
    expect(submit).toBeDisabled();
  });

  it('여러 단계는 팀 수에 맞는 stagePlan 을 함께 보내고, 다른 방식으로 돌아오면 보내지 않는다', async () => {
    useCreateHandler();
    renderPage();
    await fillRequired();
    fireEvent.click(screen.getByRole('radio', { name: TOURNAMENT_FORMAT_NAMES.league_knockouts }));
    fireEvent.change(field(/팀 수/), { target: { value: '24' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].format).toBe('league_knockouts');
    expect(stagePlanCounts(posted[0].stagePlan!).teams).toBe(24);
    cleanup();

    renderPage();
    await fillRequired();
    fireEvent.click(screen.getByRole('radio', { name: TOURNAMENT_FORMAT_NAMES.league_knockouts }));
    fireEvent.change(field(/팀 수/), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('radio', { name: TOURNAMENT_FORMAT_NAMES.knockout }));
    expect(field(/팀 수/)).toHaveValue('8');
    fireEvent.click(submitButton());
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1].format).toBe('knockout');
    expect(posted[1]).not.toHaveProperty('stagePlan');
  });

  it('주소에 format=staged 가 있으면 처음부터 여러 단계가 골라져 있다', async () => {
    searchParamsValue = new URLSearchParams('format=staged');
    renderPage();
    await sportGroup();
    expect(screen.getByRole('radio', { name: TOURNAMENT_FORMAT_NAMES.league_knockouts })).toBeChecked();
    expect(screen.getByRole('radio', { name: TOURNAMENT_FORMAT_NAMES.group_knockout })).not.toBeChecked();
  });

  describe('성별', () => {
    const quota = (label: string) => screen.getByRole('spinbutton', { name: label });

    it('기본값 칸이 골라져 있고 「기본」 표시가 붙는다', async () => {
      renderPage();
      await sportGroup();
      const defaultLabel = GENDER_CHOICE_OPTIONS.find(([value]) => value === DEFAULT_GENDER_CATEGORY)![1];
      const defaultRadio = screen.getByRole('radio', { name: defaultLabel });
      expect(defaultRadio).toBeChecked();
      expect(within(defaultRadio.closest('label')!).getByText('기본')).toBeInTheDocument();
    });

    it('혼성일 때만 인원 칸이 보이고, 남성부로 갔다 와도 입력이 남지만 남성부 요청에는 실리지 않는다', async () => {
      let call = 0;
      useCreateHandler(() => (call++ === 0 ? failure(400, 'X', '잠시 실패했어요.') : success({ id: 't-1' })));
      renderPage();
      await fillRequired();
      expect(screen.queryByRole('spinbutton', { name: '남성 최소' })).toBeNull();

      fireEvent.click(screen.getByRole('radio', { name: '혼성' }));
      for (const label of ['남성 최소', '남성 최대', '여성 최소', '여성 최대']) expect(quota(label)).toBeInTheDocument();
      fireEvent.change(quota('남성 최소'), { target: { value: '2' } });

      fireEvent.click(screen.getByRole('radio', { name: '남성부' }));
      expect(screen.queryByRole('spinbutton', { name: '남성 최소' })).toBeNull();
      fireEvent.click(submitButton());
      await waitFor(() => expect(posted).toHaveLength(1));
      expect(posted[0].genderCategory).toBe('male');
      expect(Object.keys(posted[0]).filter((key) => key.startsWith('genderM'))).toEqual([]);
      await screen.findByText('잠시 실패했어요.');

      fireEvent.click(screen.getByRole('radio', { name: '혼성' }));
      expect(quota('남성 최소')).toHaveValue(2);
      fireEvent.click(submitButton());
      await waitFor(() => expect(posted).toHaveLength(2));
      expect(posted[1].genderCategory).toBe('mixed');
      expect(posted[1].genderMinMale).toBe(2);
      expect(Object.keys(posted[1]).filter((key) => key.startsWith('genderM'))).toEqual(['genderMinMale']);
    });
  });

  it('빈 폼에서 눌러도 요청 없이 칸 아래에 이유를 보이고 첫 오류 칸으로 간다', async () => {
    useCreateHandler();
    renderPage();
    await sportGroup();
    const submit = submitButton();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(posted).toHaveLength(0);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      '종목을 선택해 주세요.',
      '대회명을 입력해 주세요.',
      '대회 시작 일시를 선택해 주세요.',
      '신청 마감 일시를 선택해 주세요.',
    ]);
    for (const alert of alerts) {
      expect(document.getElementById(alert.getAttribute('data-error-focus')!)).not.toBeNull();
    }
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('create-sport')));
    expect(scrollIntoView).toHaveBeenCalled();

    await pickSport();
    expect(screen.queryByText('종목을 선택해 주세요.')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(3);
  });

  it('혼성 인원 오류는 남성 최소 칸을 가리킨다', async () => {
    renderPage();
    await fillRequired();
    fireEvent.click(screen.getByRole('radio', { name: '혼성' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: '남성 최소' }), { target: { value: '6' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: '여성 최소' }), { target: { value: '5' } });
    fireEvent.click(submitButton());

    const alert = await screen.findByText('성별 최소 인원 합이 최대 선수 수를 넘을 수 없어요.');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(document.getElementById(alert.getAttribute('data-error-focus')!)).toBe(screen.getByRole('spinbutton', { name: '남성 최소' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: '남성 최소' })));
  });

  it('하단 바가 남은 일과 고칠 칸을 말한다', async () => {
    useCreateHandler();
    renderPage();
    await sportGroup();
    expect(barStatus()).toHaveTextContent('종목 외 3가지가 남았어요');

    await fillRequired();
    expect(barStatus()).toHaveTextContent('필수 정보를 모두 채웠어요');

    fireEvent.change(field(/신청 마감/), { target: { value: '2026-12-21T09:00' } });
    fireEvent.click(submitButton());
    expect(posted).toHaveLength(0);
    expect(barStatus()).toHaveTextContent('신청 마감을 고쳐 주세요');
    expect(screen.getByText('신청 마감은 대회 시작 전이어야 해요.')).toHaveAttribute('role', 'alert');
  });

  it('서버가 거절하면 이유를 토스트로 보이고 입력을 지키며 다시 눌러 보낼 수 있다', async () => {
    let call = 0;
    useCreateHandler(() =>
      call++ === 0
        ? failure(400, 'TOURNAMENT_TEAM_COUNT_INVALID', '이 진행 방식은 최대 64팀까지 설정할 수 있어요.')
        : success({ id: 't-9' }),
    );
    renderPage();
    await fillRequired();
    fireEvent.click(submitButton());

    expect(await screen.findByText('이 진행 방식은 최대 64팀까지 설정할 수 있어요.')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
    expect(field(/대회명/)).toHaveValue('  겨울컵 ');
    expect(field(/대회 시작/)).toHaveValue('2026-12-20T09:00');

    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.click(submitButton());
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/admin/tournaments/t-9/overview?created=1'));
    expect(posted).toHaveLength(2);
  });

  it('종목을 못 불러오면 이유와 다시 불러오기를 보인다', async () => {
    let broken = true;
    server.use(
      http.get('*/api/v1/master/sports', () =>
        broken
          ? failure(500, 'INTERNAL_ERROR', '서버 오류예요.')
          : HttpResponse.json({ status: 'success', data: [{ id: 'sport-futsal', name: '풋살', levels: [] }], timestamp: TIMESTAMP }),
      ),
    );
    renderPage();
    expect(await screen.findByText('종목을 불러오지 못했어요.')).toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByRole('radio', { name: '풋살' })).toBeInTheDocument();
    expect(screen.queryByText('종목을 불러오지 못했어요.')).toBeNull();
  });

  it('예전 마법사가 남긴 draftId 주소는 폼 대신 그 대회 개요로 보낸다', async () => {
    searchParamsValue = new URLSearchParams('draftId=abc');
    renderPage();
    expect(screen.getByText('대회 화면으로 이동하고 있어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/대회명/)).toBeNull();
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/admin/tournaments/abc/overview'));
  });

  it('목록으로 돌아가는 링크가 둘 있다', async () => {
    renderPage();
    await sportGroup();
    expect(screen.getByRole('link', { name: '대회 목록으로' })).toHaveAttribute('href', '/admin/tournaments');
    expect(screen.getByRole('link', { name: '취소' })).toHaveAttribute('href', '/admin/tournaments');
  });
});
