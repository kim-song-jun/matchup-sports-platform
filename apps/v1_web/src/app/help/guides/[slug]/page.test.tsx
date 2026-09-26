/**
 * 이용 가이드 4편. 빌드 때 정해진 4편만 만들고, 맨 위 답 상자 = meta description = Article LD description 이
 * 같은 문장이어야 한다. HowTo·FAQPage 는 싣지 않는다(리치 결과 폐지 · FAQ 원출처는 /faq).
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { faqById } from '@/lib/public-content/faq';
import { GUIDES, type Guide } from '@/lib/public-content/guides';
import HelpGuidePage, { dynamicParams, generateMetadata, generateStaticParams } from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => false }));
vi.mock('@/lib/public-site/site-info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public-site/site-info')>();
  return { ...actual, fetchPublicSiteInfo: vi.fn(async () => actual.normalizeSiteInfo(null)) };
});

beforeEach(() => {
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

const paramsOf = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function renderGuide(guide: Guide) {
  const ui = await HelpGuidePage(paramsOf(guide.slug));
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function lds(container: HTMLElement) {
  return [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => JSON.parse(node.textContent ?? '{}') as Record<string, unknown>);
}

describe('가이드 라우트', () => {
  it('정해진 4편만 정적으로 만들고, 목록 밖 slug 는 404 로 끝난다', async () => {
    expect(generateStaticParams()).toEqual(GUIDES.map((guide) => ({ slug: guide.slug })));
    expect(dynamicParams).toBe(false);
    expect(await generateMetadata(paramsOf('no-such-guide'))).toEqual({});
    await expect(HelpGuidePage(paramsOf('no-such-guide'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each(GUIDES.map((guide) => [guide.slug, guide] as const))('%s 메타데이터는 가이드 주소·요약을 쓴다', async (_slug, guide) => {
    const meta = await generateMetadata(paramsOf(guide.slug));
    expect(meta.title).toBe(guide.title);
    expect(meta.alternates?.canonical).toBe(`/help/guides/${guide.slug}`);
    expect(meta.openGraph).toMatchObject({ type: 'article' });
    expect(guide.summary.startsWith(String(meta.description).replace(/…$/, ''))).toBe(true);
  });
});

describe.each(GUIDES.map((guide) => [guide.slug, guide] as const))('가이드 %s 본문', (_slug, guide) => {
  it('답 상자가 요약 한 문장으로 먼저 오고, 단계가 순서대로 번호 목록에 있다', async () => {
    const { container } = await renderGuide(guide);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(guide.title);
    expect(container.querySelector('.tm-help-answer')?.textContent).toBe(guide.summary);
    const steps = container.querySelectorAll('ol.tm-help-steps > li');
    expect([...steps].map((li) => li.querySelector('h3')?.textContent)).toEqual(guide.steps.map((step) => step.title));
    expect(container.querySelector('.tm-ps-updated time')?.getAttribute('datetime')).toBe(guide.updatedAt);
  });

  it('관련 질문은 답 없이 /faq#id 로 딥링크한다', async () => {
    await renderGuide(guide);
    const list = screen.getByRole('list', { name: '관련 질문' });
    expect(within(list).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(
      guide.relatedFaqIds.map((id) => `/faq#${id}`),
    );
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(
      guide.relatedFaqIds.map((id) => faqById(id)!.question),
    );
  });

  it('Article LD 가 화면의 제목·답 상자·갱신일과 같고, HowTo·FAQPage 는 없다', async () => {
    const { container } = await renderGuide(guide);
    const nodes = lds(container);
    expect(nodes.map((node) => node['@type']).sort()).toEqual(['Article', 'BreadcrumbList']);
    const article = nodes.find((node) => node['@type'] === 'Article')!;
    expect(article.headline).toBe(screen.getByRole('heading', { level: 1 }).textContent);
    expect(article.description).toBe(container.querySelector('.tm-help-answer')?.textContent);
    expect(article.dateModified).toBe(container.querySelector('.tm-ps-updated time')?.getAttribute('datetime'));
    expect(article).not.toHaveProperty('datePublished');
  });

  it('지킬 수 없는 약속(운영 계정·어드민 권한·답변 시간·앱 스토어)이 없다', async () => {
    const { container } = await renderGuide(guide);
    const text = container.querySelector('main')?.textContent ?? '';
    for (const phrase of ['운영 계정', '어드민 권한', '관리자 권한', 'AI 매칭', '앱 스토어']) {
      expect(text).not.toContain(phrase);
    }
    expect(text).not.toMatch(/\d+\s*(시간|영업일)\s*(이내|안에)\s*(답|회신)/);
  });
});
