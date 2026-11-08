import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1AdCampaignDetailFixture, createV1AdCampaignFixture } from '@/test/msw/ads-fixtures';
import { createV1AdsMswHandlers } from '@/test/msw/ads-handlers';
import type { V1AdCampaign } from '@/types/ads';
import { AdsView } from './ads-view';

vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const server = setupServer();
const api = '*/api/v1';

const popupCreative = {
  imageUrl: '/uploads/ads/popup.webp',
  altText: '에버데이 이벤트',
  linkUrl: 'https://everyday.example.com/event',
  startAt: '2026-11-14T15:00:00.000Z',
  endAt: '2026-11-30T15:00:00.000Z',
  phase: null,
  headline: '11월 이벤트',
  description: null,
};

const draft = createV1AdCampaignFixture({ id: 'ad-draft', title: '겨울 신상품', advertiserName: '윈터브랜드' });
const published = createV1AdCampaignFixture({
  id: 'ad-live',
  title: '가을 할인',
  advertiserName: '에버데이',
  status: 'published',
  version: 3,
  publishedAt: '2026-11-08T00:00:00.000Z',
  banner: { ...createV1AdCampaignFixture().banner!, phase: 'live' },
});

/** Image sizes keyed by file name; the browser decode (`createImageBitmap`) is the one thing jsdom cannot do. */
const imageSizes: Record<string, { width: number; height: number }> = {
  'banner.png': { width: 3500, height: 1000 },
  'square.png': { width: 1000, height: 1000 },
  'small-banner.png': { width: 700, height: 200 },
};

function useBackend(campaigns: V1AdCampaign[], capabilities = ['status:write']) {
  const uploads: string[] = [];
  const deletedAssets: string[] = [];
  let markAdminMeServed = () => {};
  const adminMeServed = new Promise<void>((resolve) => { markAdminMeServed = resolve; });
  server.use(
    ...createV1AdsMswHandlers('none', campaigns),
    http.get(`${api}/admin/me`, () => {
      markAdminMeServed();
      return ok({ userId: 'u-1', adminUserId: 'a-1', adminRole: 'owner', status: 'active', capabilities, lastActiveAt: null });
    }),
    http.post(`${api}/admin/content-assets`, () => {
      uploads.push('upload');
      return ok({ assetId: `asset-${uploads.length}`, url: `/uploads/ads/uploaded-${uploads.length}.webp`, status: 'temporary' });
    }),
    http.delete(`${api}/admin/content-assets/:assetId`, ({ params }) => {
      deletedAssets.push(String(params.assetId));
      return ok({ assetId: params.assetId, deleted: true });
    }),
  );
  return { uploads, deletedAssets, adminMeServed };
}

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-11-08T00:00:00.000Z' });
}

function fail(statusCode: number, code: string, details?: unknown) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message: '서버 원문', details, timestamp: '2026-11-08T00:00:00.000Z' },
    { status: statusCode },
  );
}

/** Records JSON bodies and falls through to the stateful handler so the real response still applies. */
function captureBodies(method: 'put' | 'post', path: string) {
  const bodies: Array<Record<string, unknown>> = [];
  server.use(http[method](`${api}${path}`, async ({ request }) => {
    bodies.push(await request.clone().json() as Record<string, unknown>);
  }));
  return bodies;
}

function renderAds() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><AdsView /></QueryClientProvider>);
  return user;
}

async function cardOf(title: string) {
  const heading = await screen.findByText(new RegExp(title));
  return heading.closest('li') as HTMLElement;
}

async function waitForWriteAccess() {
  await waitFor(() => expect(screen.getByRole('button', { name: /새 광고/ })).toBeEnabled());
}

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/png' });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.stubGlobal('createImageBitmap', async (file: File) => ({ ...imageSizes[file.name], close: () => {} }));
});
afterEach(async () => {
  cleanup();
  // Unmounting the form deletes the images it uploaded; let those requests finish while their handler still exists.
  await new Promise((resolve) => setTimeout(resolve, 30));
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AdsView list', () => {
  it('shows each campaign with its window, channels, status and cumulative counters', async () => {
    useBackend([published, draft]);
    renderAds();

    const live = await cardOf('가을 할인');
    expect(within(live).getByText(/가을 할인 \(에버데이\)/)).toBeInTheDocument();
    expect(within(live).getByText('11. 12 ~ 11. 20 · 배너 노출 중')).toBeInTheDocument();
    expect(within(live).getByText('게시 중')).toBeInTheDocument();
    expect(within(live).getByText('누적 · 배너 노출 150 · 클릭 5')).toBeInTheDocument();
    expect(within(live).getByRole('button', { name: /중단/ })).toBeInTheDocument();
    expect(within(live).queryByRole('button', { name: /^게시/ })).toBeNull();

    const waiting = await cardOf('겨울 신상품');
    expect(within(waiting).getByText('초안')).toBeInTheDocument();
    expect(within(waiting).getByText('게시 전이라 집계가 없어요')).toBeInTheDocument();
    expect(within(waiting).getByRole('button', { name: /게시/ })).toBeInTheDocument();
  });

  it('counts campaigns per status on the filter chips and filters by status', async () => {
    useBackend([published, draft]);
    const user = renderAds();
    await cardOf('가을 할인');

    expect(screen.getByRole('button', { name: /전체\s*2/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /초안\s*1/ }));

    await waitFor(() => expect(screen.queryByText(/가을 할인/)).toBeNull());
    expect(screen.getByText(/겨울 신상품/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no campaign', async () => {
    useBackend([]);
    renderAds();
    expect(await screen.findByText('광고가 없어요')).toBeInTheDocument();
  });

  it('shows the server failure with a retry instead of an empty list', async () => {
    useBackend([]);
    server.use(http.get(`${api}/admin/ad-campaigns`, () => fail(403, 'PERMISSION_DENIED')));
    renderAds();
    expect(await screen.findByText('광고는 owner 운영자만 관리할 수 있어요.')).toBeInTheDocument();
  });
});

async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await waitForWriteAccess();
  await user.click(screen.getByRole('button', { name: /새 광고/ }));
  return screen.getByRole('complementary', { name: '광고 생성' });
}

async function fillBanner(user: ReturnType<typeof userEvent.setup>, aside: HTMLElement) {
  const banner = within(within(aside).getByRole('group', { name: /^배너/ }));
  await user.upload(banner.getByLabelText('배너 이미지 올리기'), imageFile('banner.png'));
  await banner.findByAltText('배너 소재');
  await user.type(banner.getByLabelText('대체 텍스트'), '에버데이 신제품');
  fireEvent.change(banner.getByLabelText('시작 (한국 시간)'), { target: { value: '2026-11-12T00:00' } });
  fireEvent.change(banner.getByLabelText('끝 (한국 시간)'), { target: { value: '2026-11-20T23:59' } });
  await user.type(banner.getByLabelText('이동 링크'), '/tournaments/123');
  return banner;
}

describe('AdsView create and edit', () => {
  it('saves a draft with DTO fields only, KST offsets and the uploaded image url', async () => {
    useBackend([]);
    const bodies = captureBodies('post', '/admin/ad-campaigns');
    const user = renderAds();
    const aside = await openCreateForm(user);

    await user.type(within(aside).getByLabelText('캠페인 이름 (내부용)'), '11월 협업');
    await user.type(within(aside).getByLabelText('광고주 표시 이름'), '에버데이');
    await fillBanner(user, aside);
    await user.click(within(aside).getByRole('button', { name: '초안으로 저장' }));

    expect(await screen.findByText('광고 초안을 저장했어요. 게시는 목록에서 눌러 주세요.')).toBeInTheDocument();
    expect(bodies).toEqual([{
      advertiserName: '에버데이',
      title: '11월 협업',
      banner: {
        imageUrl: '/uploads/ads/uploaded-1.webp',
        altText: '에버데이 신제품',
        linkUrl: '/tournaments/123',
        startAt: '2026-11-12T00:00:00+09:00',
        endAt: '2026-11-20T23:59:00+09:00',
      },
      popup: null,
    }]);
  });

  it('sends the version the form loaded when editing, with nothing outside the DTO', async () => {
    useBackend([draft]);
    const bodies = captureBodies('put', '/admin/ad-campaigns/ad-draft');
    const user = renderAds();
    const card = await cardOf('겨울 신상품');
    await waitForWriteAccess();

    await user.click(within(card).getByRole('button', { name: /수정/ }));
    const aside = screen.getByRole('complementary', { name: '광고 수정' });
    const title = within(aside).getByLabelText('캠페인 이름 (내부용)');
    await user.clear(title);
    await user.type(title, '겨울 신상품 (수정)');
    await user.click(within(aside).getByRole('button', { name: '수정 저장' }));

    expect(await screen.findByText('광고를 수정했어요.')).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0]).sort()).toEqual(['advertiserName', 'banner', 'expectedVersion', 'popup', 'title']);
    expect(bodies[0]).toMatchObject({
      title: '겨울 신상품 (수정)',
      expectedVersion: 1,
      banner: { startAt: '2026-11-12T00:00:00+09:00', endAt: '2026-11-20T00:00:00+09:00' },
      popup: null,
    });
  });

  it('saves twice in a row against consecutive versions, without a self-inflicted conflict', async () => {
    useBackend([draft]);
    const bodies = captureBodies('put', '/admin/ad-campaigns/ad-draft');
    const user = renderAds();
    await waitForWriteAccess();
    await user.click(within(await cardOf('겨울 신상품')).getByRole('button', { name: /수정/ }));

    for (const [index, name] of ['첫 번째 수정', '두 번째 수정'].entries()) {
      const aside = screen.getByRole('complementary', { name: '광고 수정' });
      const title = within(aside).getByLabelText('캠페인 이름 (내부용)');
      await user.clear(title);
      await user.type(title, name);
      await user.click(within(aside).getByRole('button', { name: '수정 저장' }));
      // Each save adds its own toast, and the first one is still on screen during the second.
      await waitFor(() => expect(screen.getAllByText('광고를 수정했어요.')).toHaveLength(index + 1));
      if (index === 0) {
        await user.click(await screen.findByRole('button', { name: /수정하기/ }));
      }
    }

    expect(bodies.map((body) => body.expectedVersion)).toEqual([1, 2]);
  });

  it('sends the popup headline and description with the popup channel', async () => {
    useBackend([]);
    const bodies = captureBodies('post', '/admin/ad-campaigns');
    const user = renderAds();
    const aside = await openCreateForm(user);

    await user.type(within(aside).getByLabelText('캠페인 이름 (내부용)'), '팝업만');
    await user.type(within(aside).getByLabelText('광고주 표시 이름'), '에버데이');
    const popup = within(within(aside).getByRole('group', { name: /^팝업/ }));
    await user.type(popup.getByLabelText('팝업 제목'), '11월 이벤트');
    await user.type(popup.getByLabelText('팝업 설명 (선택)'), '참여하면 선물을 드려요');
    await user.click(within(aside).getByRole('button', { name: '초안으로 저장' }));

    await screen.findByText('광고 초안을 저장했어요. 게시는 목록에서 눌러 주세요.');
    expect(bodies[0]).toMatchObject({
      banner: null,
      popup: { headline: '11월 이벤트', description: '참여하면 선물을 드려요', imageUrl: null },
    });
  });

  it('refuses a wrong-ratio image before uploading and says what to use', async () => {
    const { uploads } = useBackend([]);
    const user = renderAds();
    const aside = await openCreateForm(user);
    const banner = within(within(aside).getByRole('group', { name: /^배너/ }));

    await user.upload(banner.getByLabelText('배너 이미지 올리기'), imageFile('square.png'));

    expect(await banner.findByRole('alert')).toHaveTextContent('배너는 3.5:1 이미지를 올려 주세요. 지금 이미지는 1000×1000예요.');
    expect(uploads).toHaveLength(0);
    expect(banner.queryByAltText('배너 소재')).toBeNull();
  });

  it('uploads a right-ratio small image with a blur warning and shows the preview with the ad chip', async () => {
    const { uploads } = useBackend([]);
    const user = renderAds();
    const aside = await openCreateForm(user);
    const banner = within(within(aside).getByRole('group', { name: /^배너/ }));

    await user.upload(banner.getByLabelText('배너 이미지 올리기'), imageFile('small-banner.png'));

    expect(await banner.findByText(/작은 화면에서 흐려 보일 수 있어요/)).toBeInTheDocument();
    expect(uploads).toHaveLength(1);
    expect(banner.getByAltText('배너 소재')).toHaveAttribute('src', '/uploads/ads/uploaded-1.webp');
    expect(banner.getByText('광고')).toBeInTheDocument();
    expect(banner.getByText(/오른쪽 위에는 「광고」 표시가 붙어요/)).toBeInTheDocument();
  });

  it('deletes an image it uploaded when the editor is closed without saving', async () => {
    const { deletedAssets } = useBackend([]);
    const user = renderAds();
    const aside = await openCreateForm(user);
    const banner = within(within(aside).getByRole('group', { name: /^배너/ }));
    await user.upload(banner.getByLabelText('배너 이미지 올리기'), imageFile('banner.png'));
    await banner.findByAltText('배너 소재');

    await user.click(within(aside).getByRole('button', { name: '편집 닫기' }));

    await waitFor(() => expect(deletedAssets).toEqual(['asset-1']));
  });

  it('keeps an uploaded image that was saved and deletes the one that was replaced', async () => {
    const { deletedAssets } = useBackend([]);
    const user = renderAds();
    const aside = await openCreateForm(user);
    await user.type(within(aside).getByLabelText('캠페인 이름 (내부용)'), '교체');
    await user.type(within(aside).getByLabelText('광고주 표시 이름'), '에버데이');
    const banner = within(within(aside).getByRole('group', { name: /^배너/ }));
    await user.upload(banner.getByLabelText('배너 이미지 올리기'), imageFile('banner.png'));
    await banner.findByAltText('배너 소재');
    await user.upload(banner.getByLabelText('배너 이미지 바꾸기'), imageFile('banner.png'));
    await waitFor(() => expect(banner.getByAltText('배너 소재')).toHaveAttribute('src', '/uploads/ads/uploaded-2.webp'));

    await user.click(within(aside).getByRole('button', { name: '초안으로 저장' }));
    await screen.findByText('광고 초안을 저장했어요. 게시는 목록에서 눌러 주세요.');

    await waitFor(() => expect(deletedAssets).toEqual(['asset-1']));
  });

  it('refuses a name that is only spaces before calling the server', async () => {
    useBackend([]);
    const bodies = captureBodies('post', '/admin/ad-campaigns');
    const user = renderAds();
    const aside = await openCreateForm(user);
    await user.type(within(aside).getByLabelText('캠페인 이름 (내부용)'), '   ');
    await user.type(within(aside).getByLabelText('광고주 표시 이름'), '에버데이');

    await user.click(within(aside).getByRole('button', { name: '초안으로 저장' }));

    expect(await within(aside).findByRole('alert')).toHaveTextContent('캠페인 이름');
    expect(bodies).toHaveLength(0);
  });

  it('explains a version conflict and reloads the stored campaign on request', async () => {
    useBackend([{ ...draft, version: 2 }]);
    server.use(http.put(`${api}/admin/ad-campaigns/ad-draft`, () => fail(409, 'AD_CAMPAIGN_VERSION_CONFLICT', { currentVersion: 5 })));
    const user = renderAds();
    const card = await cardOf('겨울 신상품');
    await waitForWriteAccess();
    await user.click(within(card).getByRole('button', { name: /수정/ }));
    const aside = screen.getByRole('complementary', { name: '광고 수정' });

    await user.click(within(aside).getByRole('button', { name: '수정 저장' }));

    const alert = await within(aside).findByRole('alert');
    expect(alert).toHaveTextContent('다른 운영자가 먼저 저장했어요');
    expect(within(alert).getByRole('button', { name: '최신 내용 다시 불러오기' })).toBeInTheDocument();
  });
});

describe('AdsView publish and stop', () => {
  it('asks the owner to open the links first, then publishes at the version on screen', async () => {
    useBackend([draft]);
    const bodies = captureBodies('post', '/admin/ad-campaigns/ad-draft/publish');
    const user = renderAds();
    const card = await cardOf('겨울 신상품');
    await waitForWriteAccess();

    await user.click(within(card).getByRole('button', { name: /게시/ }));

    const dialog = screen.getByRole('dialog', { name: '광고를 게시할까요?' });
    expect(within(dialog).getByText(/서버가 대상이 실제로 있는지 확인하지 않아요/)).toBeInTheDocument();
    const link = within(dialog).getByRole('link', { name: /배너 링크 열어 보기/ });
    expect(link).toHaveAttribute('href', '/tournaments/tournament-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(bodies).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: '게시' }));

    expect(await screen.findByText('광고를 게시했어요.')).toBeInTheDocument();
    expect(bodies).toEqual([{ expectedVersion: 1 }]);
    await waitFor(() => expect(within(screen.getByRole('list')).getByText('게시 중')).toBeInTheDocument());
  });

  it('keeps the dialog open and names the missing fields when publishing is refused', async () => {
    const withoutAlt = createV1AdCampaignFixture({
      id: 'ad-draft',
      title: '겨울 신상품',
      banner: { ...createV1AdCampaignFixture().banner!, altText: null },
    });
    useBackend([withoutAlt]);
    const user = renderAds();
    const card = await cardOf('겨울 신상품');
    await waitForWriteAccess();
    await user.click(within(card).getByRole('button', { name: /게시/ }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '게시' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('배너에 채우지 않은 항목이 있어요. (대체 텍스트)');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('tells which campaign a window overlaps with', async () => {
    useBackend([draft]);
    server.use(http.post(`${api}/admin/ad-campaigns/ad-draft/publish`, () =>
      fail(409, 'AD_CHANNEL_WINDOW_OVERLAP', { channel: 'banner', conflictingCampaignId: 'ad-live', conflictingTitle: '가을 할인' })));
    const user = renderAds();
    const card = await cardOf('겨울 신상품');
    await waitForWriteAccess();
    await user.click(within(card).getByRole('button', { name: /게시/ }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '게시' }));

    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent('가을 할인');
    expect(alert).toHaveTextContent('배너');
  });

  it('stops only after the owner confirms, and the card then offers publishing again', async () => {
    useBackend([published]);
    let stopCalls = 0;
    server.use(http.post(`${api}/admin/ad-campaigns/ad-live/stop`, () => { stopCalls += 1; }));
    const user = renderAds();
    const card = await cardOf('가을 할인');
    await waitForWriteAccess();

    await user.click(within(card).getByRole('button', { name: /중단/ }));
    await user.click(within(screen.getByRole('dialog', { name: '광고를 중단할까요?' })).getByRole('button', { name: '취소' }));
    expect(stopCalls).toBe(0);

    await user.click(within(card).getByRole('button', { name: /중단/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '중단' }));

    expect(await screen.findByText('광고를 중단했어요.')).toBeInTheDocument();
    expect(stopCalls).toBe(1);
    await waitFor(() => expect(within(screen.getByRole('list')).getByRole('button', { name: /게시/ })).toBeInTheDocument());
  });
});

describe('AdsView detail', () => {
  const live = createV1AdCampaignFixture({
    id: 'ad-live',
    title: '가을 할인',
    status: 'published',
    version: 3,
    banner: { ...createV1AdCampaignFixture().banner!, phase: 'live' },
    popup: { ...popupCreative, phase: 'scheduled' },
  });

  it('shows both creatives, cumulative and today counters, CTR and the measurement caveat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T03:00:00+09:00'));
    useBackend([live]);
    const user = renderAds();
    const card = await cardOf('가을 할인');

    await user.click(within(card).getByRole('button', { name: /조회/ }));

    const aside = screen.getByRole('complementary', { name: '광고 상세 조회' });
    const banner = await within(aside).findByRole('region', { name: '배너 성과' });
    expect(within(aside).getByAltText('에버데이 신제품 풋살화')).toBeInTheDocument();
    expect(within(aside).getAllByText('광고')).toHaveLength(2);
    expect(within(aside).getByText('11월 이벤트')).toBeInTheDocument();
    expect(within(banner).getByText('누적 노출').nextSibling).toHaveTextContent('150');
    expect(within(banner).getByText('누적 클릭').nextSibling).toHaveTextContent('5');
    expect(within(banner).getByText('오늘 노출').nextSibling).toHaveTextContent('100');
    expect(within(banner).getByText('오늘 클릭').nextSibling).toHaveTextContent('4');
    expect(within(banner).getByText(/CTR/).nextSibling).toHaveTextContent('3.33%');
    const popup = within(aside).getByRole('region', { name: '팝업 성과' });
    expect(within(popup).getByText(/CTR/).nextSibling).toHaveTextContent('계산 불가');
    expect(within(aside).getByText(/네트워크 오류·호출 제한으로 일부 누락될 수 있어요/)).toHaveTextContent('집계 갱신: 2026. 11. 12. 21:00');
  });

  it('lists the daily rows only after the owner opens the table', async () => {
    useBackend([live]);
    const user = renderAds();
    await user.click(within(await cardOf('가을 할인')).getByRole('button', { name: /조회/ }));
    const aside = screen.getByRole('complementary', { name: '광고 상세 조회' });
    await within(aside).findByRole('region', { name: '배너 성과' });
    expect(within(aside).queryByRole('table')).toBeNull();

    await user.click(within(aside).getByRole('button', { name: '일별 표 보기' }));

    const rows = within(within(aside).getByRole('table')).getAllByRole('row');
    expect(within(rows[1]).getByText('2026-11-12')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2026-11-11')).toBeInTheDocument();
  });

  it('does not clamp a CTR above 100%', async () => {
    useBackend([live]);
    const detail = createV1AdCampaignDetailFixture(live);
    server.use(http.get(`${api}/admin/ad-campaigns/ad-live`, () => ok({
      ...detail,
      stats: { ...detail.stats, banner: { impressions: 100, clicks: 120 } },
    })));
    const user = renderAds();
    await user.click(within(await cardOf('가을 할인')).getByRole('button', { name: /조회/ }));

    const banner = await screen.findByRole('region', { name: '배너 성과' });
    expect(within(banner).getByText(/CTR/).nextSibling).toHaveTextContent('120%');
  });

  it('hides every write action when the admin cannot write', async () => {
    const { adminMeServed } = useBackend([live], []);
    const user = renderAds();
    const card = await cardOf('가을 할인');
    // Without this the buttons are also absent merely because the admin profile has not arrived yet.
    await adminMeServed;
    await new Promise((resolve) => setTimeout(resolve, 50));

    await user.click(within(card).getByRole('button', { name: /조회/ }));

    const aside = screen.getByRole('complementary', { name: '광고 상세 조회' });
    await within(aside).findByRole('region', { name: '배너 성과' });
    expect(within(aside).queryByRole('button', { name: /수정하기/ })).toBeNull();
    expect(within(aside).queryByRole('button', { name: /^중단/ })).toBeNull();
    expect(screen.getByRole('button', { name: /새 광고/ })).toBeDisabled();
  });
});
