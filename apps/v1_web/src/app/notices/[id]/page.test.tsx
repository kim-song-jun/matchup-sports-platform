import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import NoticeDetailPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', () => ({
  fetchPublicV1: vi.fn(),
  buildNoIndexMetadata: vi.fn(),
  buildPublicMetadata: vi.fn(),
  metadataDescription: vi.fn(),
}));

vi.mock('@/components/notices/notices-client', () => ({ NoticeDetailPageClient: () => null }));

const fetchPublicV1Mock = vi.mocked(fetchPublicV1);

describe('NoticeDetailPage (server)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('서버에서 받은 공지를 클라이언트에 seed 로 넘긴다', async () => {
    const notice = { notice: { noticeId: 'n1', title: '점검 안내' } };
    fetchPublicV1Mock.mockResolvedValue(notice as never);

    const element = await NoticeDetailPage({ params: Promise.resolve({ id: 'n1' }) });

    expect(element.props.noticeId).toBe('n1');
    expect(element.props.seed).toEqual(notice);
  });

  it('없는 공지는 notFound 로 끝난다', async () => {
    fetchPublicV1Mock.mockResolvedValue(null as never);

    await expect(NoticeDetailPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
