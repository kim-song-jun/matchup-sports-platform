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

  it.each([
    ['팀매치', teamMatchMetadata, 'tm-1'],
    ['개인 매치', matchMetadata, 'm-1'],
  ])('%s: 제목·설명에 든 전화번호는 description·og·twitter 모두에서 가려지고 시각은 남는다', async (_kind, generate, id) => {
    fetchPublicV1.mockResolvedValue({
      ...detail,
      title: '010-1234-5678 팀장 주최 친선전',
      description: '참가 문의는 010-1234-5678 로 주세요. 토요일 19:00 킥오프예요.',
    });

    const meta = await generate({ params: Promise.resolve({ id }) });

    const description = '참가 문의는 ***-****-**** 로 주세요. 토요일 19:00 킥오프예요.';
    expect(meta.description).toBe(description);
    expect(meta.openGraph?.description).toBe(description);
    expect(meta.twitter?.description).toBe(description);
    expect(meta.title).toBe('***-****-**** 팀장 주최 친선전');
    expect(meta.openGraph?.title).toBe('***-****-**** 팀장 주최 친선전 | Teameet');
    expect(meta.twitter?.title).toBe('***-****-**** 팀장 주최 친선전 | Teameet');
    expect(JSON.stringify(meta)).not.toMatch(/010-1234-5678|1234-5678/);
  });
});
