import { AUDIENCE_PAGES } from '@/lib/public-content/audiences';
import { FAQ_CATEGORIES, FAQ_UPDATED_AT } from '@/lib/public-content/faq';
import { GLOSSARY_UPDATED_AT } from '@/lib/public-content/glossary';
import { GUIDES, guidePath } from '@/lib/public-content/guides';

export type PublicSiteRoute = {
  readonly path: string;
  readonly title: string;
  /** llms.txt 한 줄 설명. */
  readonly summary: string;
  readonly sitemapPriority: number;
  /** YYYY-MM-DD. 날짜를 가진 콘텐츠가 없는 페이지는 null. */
  readonly lastModified: string | null;
};

/**
 * 공개 소개·도움말 페이지 목록. sitemap·robots·llms.txt 가 이 배열 하나를 읽는다 —
 * 새 공개 페이지를 여기 빠뜨리면 routes.test.ts 가 페이지 파일과 대조해 잡는다.
 */
export const PUBLIC_SITE_ROUTES: readonly PublicSiteRoute[] = [
  {
    path: '/help',
    title: '도움말',
    summary: '질문 검색, 이용 가이드, 용어집, 문의 창구를 모은 도움말 첫 화면',
    sitemapPriority: 0.6,
    lastModified: null,
  },
  {
    path: '/faq',
    title: '자주 묻는 질문',
    summary: `${FAQ_CATEGORIES.map((category) => category.label).join(', ')} 주제별 질문과 답`,
    sitemapPriority: 0.6,
    lastModified: FAQ_UPDATED_AT,
  },
  ...GUIDES.map((guide) => ({
    path: guidePath(guide.slug),
    title: guide.title,
    summary: guide.summary,
    sitemapPriority: 0.5,
    lastModified: guide.updatedAt,
  })),
  {
    path: '/help/glossary',
    title: '용어집',
    summary: '대회·리그·결과 화면에서 쓰는 말의 뜻',
    sitemapPriority: 0.4,
    lastModified: GLOSSARY_UPDATED_AT,
  },
  ...AUDIENCE_PAGES.map((page) => ({
    path: page.path,
    title: page.metaTitle,
    summary: page.metaDescription,
    sitemapPriority: 0.7,
    lastModified: page.updatedAt,
  })),
  {
    path: '/contact',
    title: '문의하기',
    summary: '회원 1:1 문의, 이메일 창구, 비회원 대회 개설·제휴 문의 폼',
    sitemapPriority: 0.5,
    lastModified: null,
  },
];

/** robots `Allow` 에 올릴 경로. 하위 경로는 앞부분 일치로 함께 열린다. */
export const PUBLIC_SITE_ALLOW_PATHS = ['/help', '/faq', '/for/', '/contact'] as const;
