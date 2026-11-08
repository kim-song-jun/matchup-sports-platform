import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { EMAIL_CHANGE_MSW } from '@/test/msw/profile-email-change-handlers';
import { v1ProfileFixture } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import type { V1Profile } from '@/types/api';
import { PlayerCardHiddenSettingsPageClient } from './my-api-clients';

/**
 * 카드 사진 위치 맞추기는 프로필 저장 API(`PATCH /me/profile`)로 사진만 바꾼다. 이 저장이 캐시의 이메일을 함께 실으면, 다른 기기에서
 * 이메일을 바꾼 뒤 이 화면의 옛 캐시가 "이메일을 바꾸려는 요청"으로 읽혀 인증번호 없이 400 이 난다. 이메일은 보내지 않고 서버가 지금 값을 유지한다.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/my/settings/player-card',
}));

const upload = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/hooks/use-v1-api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-v1-api');
  return {
    ...actual,
    useV1PlayerCardHidden: () => ({ data: { hidden: false }, isLoading: false, isError: false }),
    useV1UpdatePlayerCardHidden: () => ({ mutate: vi.fn(), isPending: false }),
    useV1PlayerCardShape: () => ({
      data: { shape: 'rect', unlocked: ['rect'], reviewCount: 3, requiredForShield: 10 },
      isLoading: false,
      isError: false,
    }),
    useV1UpdatePlayerCardShape: () => ({ mutate: vi.fn(), isPending: false }),
    useV1UploadImages: () => ({ mutateAsync: upload.mutateAsync, isPending: false }),
  };
});
// 캔버스로 자르는 모달은 브라우저 API 라 jsdom 에서 돌릴 수 없다 — 자르기를 끝낸 결과만 흉내 낸다.
vi.mock('./profile-photo-cropper', () => ({
  ProfilePhotoCropper: ({ title, onCropped }: { title?: string; onCropped: (file: File) => void }) => (
    <button type="button" onClick={() => onCropped(new File(['cropped'], 'profile.webp', { type: 'image/webp' }))}>{title}</button>
  ),
}));

const NEW_PHOTO = '/uploads/new-photo.webp';
/** 이 기기의 캐시가 아는 이메일 — 다른 기기에서 서버의 이메일(`EMAIL_CHANGE_MSW.currentEmail`)이 이미 바뀐 뒤다. */
const STALE_CACHED_EMAIL = 'stale-old@example.com';
const SERVER_PROFILE: V1Profile = {
  ...v1ProfileFixture,
  email: STALE_CACHED_EMAIL,
  phone: '01011112222',
  profile: {
    displayName: '민준FC',
    realName: '김민준',
    nickname: '민준FC',
    bio: '골 넣는 풀백이에요',
    profileImageUrl: '/uploads/old-photo.webp',
    birthDate: '1995-01-15',
    gender: 'male',
  },
};

let patchBodies: Array<Record<string, unknown>>;
let client: QueryClient;

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks();
  upload.mutateAsync.mockResolvedValue({ urls: [NEW_PHOTO] });
  patchBodies = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(
    http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
    http.get('*/api/v1/me/profile', () => HttpResponse.json({ status: 'success', data: SERVER_PROFILE, timestamp: '2026-11-06T00:00:00.000Z' })),
    // 공유 핸들러가 이메일 변경 규칙(바꾸려면 증명 필요)으로 응답하고, 이 화면이 실제로 보낸 본문만 옆에서 기록한다.
    http.patch('*/api/v1/me/profile', async ({ request }) => {
      patchBodies.push((await request.clone().json()) as Record<string, unknown>);
      return undefined;
    }),
  );
});
afterEach(() => server.resetHandlers());

describe('카드 사진 위치 맞추기 저장', () => {
  it('사진만 바꾸므로 이메일은 보내지 않고, 다른 칸은 저장된 값 그대로 보내며, 이메일 증명 없이도 저장된다', async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><PlayerCardHiddenSettingsPageClient /></QueryClientProvider>);

    await user.click(await screen.findByRole('button', { name: /사진 위치 맞추기/ }));
    await user.click(await screen.findByRole('button', { name: '카드 사진 위치 맞추기' }));

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).not.toHaveProperty('email');
    expect(patchBodies[0]).toEqual({
      realName: '김민준',
      nickname: '민준FC',
      bio: '골 넣는 풀백이에요',
      profileImageUrl: NEW_PHOTO,
      phone: '01011112222',
      birthDate: '19950115',
      gender: 'male',
    });
    // 서버가 증명을 요구했다면 "저장하지 못했어요" 카드가 떴을 것이다. 저장이 끝나면 캐시의 이메일도 서버 값으로 맞는다.
    await waitFor(() => expect(client.getQueryData<V1Profile>(v1Keys.profile())?.email).toBe(EMAIL_CHANGE_MSW.currentEmail));
    expect(screen.queryByText('저장하지 못했어요')).not.toBeInTheDocument();
  });
});
