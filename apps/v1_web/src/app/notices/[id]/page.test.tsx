import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import { buildNoticeArticleLd } from '@/lib/structured-data';
import NoticeDetailPage, { generateMetadata } from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/seo')>()),
  fetchPublicV1: vi.fn(),
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

describe('NoticeDetailPage generateMetadata', () => {
  beforeEach(() => vi.clearAllMocks());

  const NOTICE_FALLBACK = 'Teameet 공지사항을 확인하세요.';
  const describeNotice = async (notice: Record<string, unknown>) => {
    fetchPublicV1Mock.mockResolvedValue({ notice: { noticeId: 'n1', title: '점검 안내', ...notice } } as never);
    return generateMetadata({ params: Promise.resolve({ id: 'n1' }) });
  };

  it('본문 속 이미지 자리표시 줄은 검색·공유 설명에 싣지 않는다', async () => {
    const meta = await describeNotice({
      body: '[이미지: 11]\n12일 02:00~04:00 서비스 점검이 있어요. 이용에 참고해 주세요.\n[이미지: 12]',
    });

    const expected = '12일 02:00~04:00 서비스 점검이 있어요. 이용에 참고해 주세요.';
    expect(meta.description).toBe(expected);
    expect(meta.openGraph?.description).toBe(expected);
    expect(meta.twitter?.description).toBe(expected);
  });

  it('이미지뿐인 공지는 자리표시 글자 대신 기본 문구로 나간다', async () => {
    const imageOnlyBody = '[이미지: 11]\n[이미지: 12]\n[이미지: 13]';
    expect((await describeNotice({ body: imageOnlyBody })).description).toBe(NOTICE_FALLBACK);
    const withDocument = await describeNotice({
      body: imageOnlyBody,
      content: { type: 'doc', content: [{ type: 'image', attrs: { src: '/uploads/a.png' } }] },
    });
    expect(withDocument.description).toBe(NOTICE_FALLBACK);
  });

  it('본문이 서식 문서로 오면 그 글자를 설명으로 쓴다', async () => {
    const meta = await describeNotice({
      body: '[이미지: 3]',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '이번 주말 대회 운영 안내를 드려요.' }] }] },
    });

    expect(meta.description).toBe('이번 주말 대회 운영 안내를 드려요.');
  });

  it('공지 본문에 적힌 전화번호는 설명에서 가려진다', async () => {
    const meta = await describeNotice({ body: '현장 문의는 010-1234-5678 로 연락 주세요. 접수는 19:00 에 마감해요.' });

    expect(meta.description).toBe('현장 문의는 ***-****-**** 로 연락 주세요. 접수는 19:00 에 마감해요.');
  });
});
