import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import { buildNoticeArticleLd } from '@/lib/structured-data';
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

vi.mock('@/lib/structured-data', () => ({ buildNoticeArticleLd: vi.fn(() => ({ '@type': 'Article' })) }));
vi.mock('@/components/seo/json-ld', () => ({ JsonLd: () => null }));
vi.mock('@/components/notices/notices-client', () => ({ NoticeDetailPageClient: () => null }));

const fetchPublicV1Mock = vi.mocked(fetchPublicV1);

/** 반환 트리에서 `key` prop 을 가진 엘리먼트(클라이언트 컴포넌트)를 찾아 props 를 본다. */
function findProps(node: unknown, key: string): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const el = node as { props?: Record<string, unknown> };
  if (el.props && key in el.props) return el.props;
  const children = el.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findProps(child, key);
    if (found) return found;
  }
  return undefined;
}

describe('NoticeDetailPage (server)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('서버에서 받은 공지를 클라이언트에 seed 로 넘긴다', async () => {
    const notice = { notice: { noticeId: 'n1', title: '점검 안내' } };
    fetchPublicV1Mock.mockResolvedValue(notice as never);

    const element = await NoticeDetailPage({ params: Promise.resolve({ id: 'n1' }) });

    expect(findProps(element, 'noticeId')).toMatchObject({ noticeId: 'n1', seed: notice });
    expect(vi.mocked(buildNoticeArticleLd)).toHaveBeenCalledWith(notice.notice, 'n1');
    expect(findProps(element, 'data')).toEqual({ data: { '@type': 'Article' } });
  });

  it('없는 공지는 notFound 로 끝난다', async () => {
    fetchPublicV1Mock.mockResolvedValue(null as never);

    await expect(NoticeDetailPage({ params: Promise.resolve({ id: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
