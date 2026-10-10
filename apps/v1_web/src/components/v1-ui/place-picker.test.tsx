import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceValue } from '@/lib/place';
import { server } from '@/test/msw/server';
import { installViewport } from '@/test/viewport';
import type { V1RecentVenue } from '@/types/api';
import { PlacePicker } from './place-picker';

function Harness({
  initial = null,
  recentVenues,
  onValue,
  maxLength = 120,
}: {
  initial?: PlaceValue | null;
  recentVenues?: V1RecentVenue[];
  onValue?: (value: PlaceValue | null) => void;
  maxLength?: number;
}) {
  const [value, setValue] = useState<PlaceValue | null>(initial);
  return (
    <PlacePicker
      label="장소"
      value={value}
      recentVenues={recentVenues}
      maxLength={maxLength}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function renderPicker(props: Parameters<typeof Harness>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

/** 검색어 하이라이트가 <mark> 로 이름을 쪼개므로 접근성 이름 대신 텍스트로 옵션을 찾는다. */
async function findOption(text: string) {
  return await waitFor(() => {
    const found = screen.getAllByRole('option').find((option) => option.textContent?.includes(text));
    if (!found) throw new Error(`option not found: ${text}`);
    return found;
  });
}

function errorBody(statusCode: number, code: string, message: string) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message, details: null, requestId: 'r', timestamp: '2026-10-10T00:00:00.000Z' },
    { status: statusCode },
  );
}

describe('PlacePicker', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());
  // V1ApiError 는 클라이언트 오류 리포터로도 보고된다 — 이 테스트들의 관심사가 아니라 받아만 둔다.
  beforeEach(() => server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({}))));

  it('입력하면 디바운스 뒤 검색 결과를 보여 주고, 고르면 좌표가 담긴 picked 값이 된다', async () => {
    const onValue = vi.fn();
    renderPicker({ onValue });

    fireEvent.change(screen.getByRole('combobox', { name: '장소' }), { target: { value: '망원 풋살' } });

    const option = await findOption('망원한강공원 풋살장');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    expect(option).toHaveTextContent('서울 마포구 마포나루길 467');
    fireEvent.click(option);

    expect(onValue).toHaveBeenLastCalledWith({
      kind: 'picked',
      name: '망원한강공원 풋살장',
      address: '서울 마포구 마포나루길 467',
      latitude: 37.5558,
      longitude: 126.8985,
      provider: 'kakao',
      providerPlaceId: 'kakao-place-mangwon-hangang',
    });
    const change = await screen.findByRole('button', { name: '장소 바꾸기' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await waitFor(() => expect(change).toHaveFocus());
  });

  it('키보드로 고른다: ↓로 이동하면 activedescendant 가 따라가고 Enter 가 선택, Esc 는 목록만 닫는다', async () => {
    const onValue = vi.fn();
    renderPicker({ onValue });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '망원' } });
    await findOption('망원유수지');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = await findOption('망원유수지 체육공원 풋살장');
    expect(input).toHaveAttribute('aria-activedescendant', second.id);
    expect(second).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'picked', providerPlaceId: 'kakao-place-mangwon-yusuji' }),
    );
  });

  it('Esc 는 열린 목록을 닫는다', async () => {
    renderPicker();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '망원' } });
    await findOption('망원한강공원');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('"이름만 직접 입력"을 고르면 이름만 담긴 manual 값이 되고 검색으로 되돌아갈 수 있다', async () => {
    const onValue = vi.fn();
    renderPicker({ onValue });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '망원' } });
    fireEvent.click(await screen.findByRole('option', { name: /이름만 직접 입력/ }));

    // 검색어가 이름 칸으로 넘어간다.
    const manualInput = await screen.findByRole('textbox', { name: '장소' });
    expect(manualInput).toHaveValue('망원');
    expect(onValue).toHaveBeenLastCalledWith({ kind: 'manual', name: '망원' });

    fireEvent.change(manualInput, { target: { value: '동네 운동장' } });
    expect(onValue).toHaveBeenLastCalledWith({ kind: 'manual', name: '동네 운동장' });

    fireEvent.click(screen.getByRole('button', { name: /검색으로 장소 찾기/ }));
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('직접 입력 이름은 화면이 넘긴 한도까지 받는다 — 대회 한도 200 이면 150자도 그대로 들어간다', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderPicker({ onValue, maxLength: 200, initial: { kind: 'manual', name: '' } });

    // user-event 는 브라우저처럼 maxlength 를 넘는 글자를 잘라 낸다 — 한도가 100 이면 100자만 남는다.
    const manualInput = screen.getByRole('textbox', { name: '장소' });
    await user.click(manualInput);
    await user.paste('가'.repeat(150));

    expect(manualInput).toHaveValue('가'.repeat(150));
    expect(onValue).toHaveBeenLastCalledWith({ kind: 'manual', name: '가'.repeat(150) });
  });

  it('검색 결과가 없으면 안내와 직접 입력 버튼을 보여 준다', async () => {
    renderPicker();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '없는곳xyz' } });

    expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이름만 직접 입력' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('503 PLACE_SEARCH_UNAVAILABLE 이면 검색 불가 안내와 직접 입력만 주고 재시도 버튼은 없다', async () => {
    server.use(http.get('*/api/v1/places/search', () => errorBody(503, 'PLACE_SEARCH_UNAVAILABLE', 'unavailable')));
    const onValue = vi.fn();
    renderPicker({ onValue });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '망원' } });

    expect(await screen.findByText(/지금은 장소 검색을 쓸 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이름만 직접 입력' }));
    expect(onValue).toHaveBeenLastCalledWith({ kind: 'manual', name: '망원' });
  });

  it('그 밖의 오류는 서버 메시지와 다시 시도 버튼을 보여 주고, 재시도하면 결과가 나온다', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/places/search', () => {
        calls += 1;
        if (calls === 1) return errorBody(502, 'PLACE_SEARCH_FAILED', '카카오 응답이 늦어요');
        return HttpResponse.json({
          status: 'success',
          data: { items: [], hasMore: false },
          timestamp: '2026-10-10T00:00:00.000Z',
        });
      }),
    );
    renderPicker();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '망원' } });

    expect(await screen.findByText('카카오 응답이 늦어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(calls).toBe(2));
    expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument();
  });

  it('최근 장소 칩을 누르면 좌표까지 그대로 복원한다', () => {
    const onValue = vi.fn();
    renderPicker({
      onValue,
      recentVenues: [
        { placeName: '성산 풋살파크', addressText: '서울 마포구 월드컵로 20', latitude: 37.56, longitude: 126.91, provider: 'kakao', providerPlaceId: 'recent-1' },
        { placeName: '동네 운동장', addressText: null, latitude: null, longitude: null, provider: null, providerPlaceId: null },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '성산 풋살파크' }));

    expect(onValue).toHaveBeenLastCalledWith({
      kind: 'picked',
      name: '성산 풋살파크',
      address: '서울 마포구 월드컵로 20',
      latitude: 37.56,
      longitude: 126.91,
      provider: 'kakao',
      providerPlaceId: 'recent-1',
    });
    expect(screen.getByRole('button', { name: '장소 바꾸기' })).toHaveFocus();
  });

  it('좌표 없는 최근 장소 칩은 manual 입력 모드로 복원한다', () => {
    renderPicker({
      recentVenues: [{ placeName: '동네 운동장', addressText: null, latitude: null, longitude: null, provider: null, providerPlaceId: null }],
    });
    fireEvent.click(screen.getByRole('button', { name: '동네 운동장' }));
    expect(screen.getByRole('textbox', { name: '장소' })).toHaveValue('동네 운동장');
  });

  it('고른 장소에서 바꾸기를 누르면 다시 검색 입력이 된다', async () => {
    const onValue = vi.fn();
    renderPicker({
      onValue,
      initial: { kind: 'picked', name: '성산 풋살파크', address: '서울 마포구', latitude: 37.5, longitude: 126.9, provider: 'kakao', providerPlaceId: 'p1' },
    });
    expect(screen.getByText('성산 풋살파크')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '장소 바꾸기' }));

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('바깥에서 값을 null 로 초기화하면 직접 입력 모드에서 검색 모드로 돌아간다', () => {
    function Resettable() {
      const [value, setValue] = useState<PlaceValue | null>({ kind: 'manual', name: '동네 운동장' });
      return (
        <>
          <button type="button" onClick={() => setValue(null)}>초기화</button>
          <PlacePicker label="장소" value={value} onChange={setValue} maxLength={120} />
        </>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Resettable />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('textbox', { name: '장소' })).toHaveValue('동네 운동장');

    fireEvent.click(screen.getByRole('button', { name: '초기화' }));

    expect(screen.getByRole('combobox', { name: '장소' })).toHaveValue('');
  });

  it('직접 입력 칸을 사용자가 비워도 직접 입력 모드에 머문다', () => {
    renderPicker({ initial: { kind: 'manual', name: '동네 운동장' } });
    fireEvent.change(screen.getByRole('textbox', { name: '장소' }), { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: '장소' })).toHaveValue('');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('error 를 받으면 입력에 연결해 alert 로 보여 준다', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <PlacePicker label="장소" value={null} onChange={() => {}} error="장소를 골라 주세요" maxLength={120} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('장소를 골라 주세요');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });
  describe('고른 장소 지도 미리보기', () => {
    const picked: PlaceValue = {
      kind: 'picked', name: '성산 풋살파크', address: '서울 마포구', latitude: 37.5, longitude: 126.9, provider: 'kakao', providerPlaceId: 'p1',
    };
    let restoreViewport: (() => void) | undefined;
    let scrollIntoView: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      server.use(
        http.get('*/api/v1/public/integrations/kakao-maps-key', () =>
          HttpResponse.json({ status: 'success', data: { kakaoMapsJsKey: 'test-js-key' }, timestamp: '2026-10-10T00:00:00.000Z' }),
        ),
      );
      Object.assign(window, {
        kakao: {
          maps: {
            load: (cb: () => void) => cb(),
            LatLng: vi.fn(() => ({})),
            Map: vi.fn(() => ({})),
            Marker: vi.fn(() => ({ setMap: vi.fn() })),
          },
        },
      });
      // jsdom 에는 scrollIntoView 가 없다 — 브라우저 API 스텁.
      scrollIntoView = vi.fn();
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    });
    afterEach(() => {
      restoreViewport?.();
      restoreViewport = undefined;
      delete (window as { kakao?: unknown }).kakao;
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it('데스크톱(1024px 이상)에서만 240px 로 키우고 모바일은 120px 그대로다', async () => {
      restoreViewport = installViewport(1280);
      const desktop = renderPicker({ initial: picked });
      expect(await screen.findByRole('link', { name: '성산 풋살파크 지도 크게 보기' })).toHaveStyle({ height: '240px' });
      desktop.unmount();
      restoreViewport();

      restoreViewport = installViewport(390);
      renderPicker({ initial: picked });
      expect(await screen.findByRole('link', { name: '성산 풋살파크 지도 크게 보기' })).toHaveStyle({ height: '120px' });
    });

    it('데스크톱에서 장소를 고른 직후에만 지도를 화면 안으로 스크롤한다 — 값이 채워진 채 열린 폼은 움직이지 않는다', async () => {
      restoreViewport = installViewport(1280);
      const prefilled = renderPicker({ initial: picked });
      await screen.findByRole('link', { name: '성산 풋살파크 지도 크게 보기' });
      expect(scrollIntoView).not.toHaveBeenCalled();
      prefilled.unmount();

      renderPicker();
      fireEvent.change(screen.getByRole('combobox', { name: '장소' }), { target: { value: '망원 풋살' } });
      fireEvent.click(await findOption('망원한강공원 풋살장'));

      const map = await screen.findByRole('link', { name: '망원한강공원 풋살장 지도 크게 보기' });
      // 검색 목록도 scrollIntoView 를 부르므로 호출 대상(this)이 지도 상자인지로 가린다.
      await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(map));
    });

    it('모바일에서는 장소를 골라도 지도 때문에 스크롤하지 않는다', async () => {
      restoreViewport = installViewport(390);
      renderPicker();
      fireEvent.change(screen.getByRole('combobox', { name: '장소' }), { target: { value: '망원 풋살' } });
      fireEvent.click(await findOption('망원한강공원 풋살장'));

      const map = await screen.findByRole('link', { name: '망원한강공원 풋살장 지도 크게 보기' });
      expect(map).toHaveStyle({ height: '120px' });
      expect(scrollIntoView.mock.contexts).not.toContain(map);
    });
  });
});
