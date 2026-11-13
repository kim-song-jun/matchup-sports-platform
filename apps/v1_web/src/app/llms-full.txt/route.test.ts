/**
 * llms-full 의 문의 주소는 llms.txt·푸터와 같은 어드민 사업자 정보 설정에서 나와야 한다 —
 * 코드에 박아 두면 어드민이 바꾼 뒤 두 안내서가 서로 다른 주소를 알려 준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_INFO_DEFAULTS } from '@/lib/public-site/site-info';

const fetchPublicV1 = vi.fn();

vi.mock('@/lib/seo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo')>('@/lib/seo');
  return { ...actual, fetchPublicV1: (path: string) => fetchPublicV1(path) };
});

// 공개 API 수십 건을 도는 수집 단계는 이 라우트의 계약이 아니다 — 렌더러에는 빈 스냅샷을 넘긴다.
vi.mock('@/lib/llms-full', () => ({
  collectLlmsFullSnapshot: async () => ({
    tournaments: [], leagues: [], campaigns: [], matches: [], teamMatches: [], teams: [],
  }),
}));

const { GET } = await import('./route');

beforeEach(() => {
  fetchPublicV1.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /llms-full.txt', () => {
  it('문의 주소는 어드민 사업자 정보 설정 값을 쓴다', async () => {
    fetchPublicV1.mockImplementation(async (path: string) =>
      path === '/public/site-info' ? { contactEmail: 'help@example.com' } : null,
    );

    const body = await (await GET()).text();

    expect(body).toContain('- 문의: help@example.com\n');
    expect(body).not.toContain(SITE_INFO_DEFAULTS.contactEmail);
  });

  it('사업자 정보를 못 받으면 llms.txt 와 같은 기본 주소로 문의 줄을 낸다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchPublicV1.mockRejectedValue(new Error('upstream down'));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(`- 문의: ${SITE_INFO_DEFAULTS.contactEmail}\n`);
  });
});
