import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchPublicV1 = vi.fn();

vi.mock('@/lib/seo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo')>('@/lib/seo');
  return { ...actual, fetchPublicV1: (path: string) => fetchPublicV1(path) };
});

const { generateMetadata: teamMatchMetadata } = await import('./team-matches/[id]/page');
const { generateMetadata: matchMetadata } = await import('./matches/[id]/page');

afterEach(() => {
  fetchPublicV1.mockReset();
});

// 상세 응답은 종목·장소를 중첩 객체에만 담는다(alpha 실측) — 평평한 sportName·placeName 이 없다.
const detail = { title: '주말 친선전', description: '0927', sport: { name: '풋살' }, place: { name: '케이풋살파크' } };

describe('매치·팀매치 상세 메타 설명', () => {
  it('팀매치: 설명이 짧으면 중첩 필드의 종목·장소로 기본 문구를 만든다(undefined 없이)', async () => {
    fetchPublicV1.mockResolvedValue(detail);
    const meta = await teamMatchMetadata({ params: Promise.resolve({ id: 'tm-1' }) });
    expect(meta.description).toBe('풋살 · 케이풋살파크에서 열리는 팀매치 정보를 확인해 보세요.');
  });

  it('개인 매치: 장소를 모르면 있는 조각만 쓴다', async () => {
    fetchPublicV1.mockResolvedValue({ ...detail, description: null, place: null });
    const meta = await matchMetadata({ params: Promise.resolve({ id: 'm-1' }) });
    expect(meta.description).toBe('풋살 개인 매치 정보를 확인해 보세요.');
    expect(String(meta.description)).not.toContain('undefined');
  });
});
