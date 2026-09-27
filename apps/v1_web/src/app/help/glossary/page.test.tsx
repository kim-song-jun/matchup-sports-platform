/**
 * 용어집의 DefinedTermSet 은 "정규 리그란?" 같은 개념 질문의 인용 원천이다. LD 의 용어·정의·별칭이
 * 화면과 어긋나거나 @id 앵커가 없는 곳을 가리키면 인용 링크가 깨진다.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { GLOSSARY_TERMS } from '@/lib/public-content/glossary';
import GlossaryPage, { metadata } from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
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

async function renderGlossary() {
  const ui = await GlossaryPage();
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

type LdTerm = { '@id': string; name: string; description: string; alternateName?: string[] };

describe('/help/glossary', () => {
  it('메타데이터가 용어집 주소를 canonical 로 쓴다', () => {
    expect(metadata.title).toBe('용어집');
    expect(metadata.alternates?.canonical).toBe('/help/glossary');
  });

  it('DefinedTermSet 의 용어·정의·별칭·앵커가 화면과 1:1 이다', async () => {
    const { container } = await renderGlossary();
    const sets = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((node) => JSON.parse(node.textContent ?? '{}') as Record<string, unknown>)
      .filter((node) => node['@type'] === 'DefinedTermSet');
    expect(sets).toHaveLength(1);
    const terms = sets[0].hasDefinedTerm as LdTerm[];
    const items = [...container.querySelectorAll('li.tm-help-term')];
    expect(terms).toHaveLength(items.length);
    terms.forEach((term, index) => {
      const item = items[index];
      expect(term.name).toBe(item.querySelector('h2')?.textContent);
      expect(term.description).toBe(item.querySelector('.tm-help-term-def')?.textContent);
      expect(new URL(term['@id']).hash).toBe(`#${item.id}`);
      const alias = item.querySelector('.tm-help-term-alias')?.textContent ?? null;
      expect(alias).toBe(term.alternateName ? `같은 뜻: ${term.alternateName.join(', ')}` : null);
    });
  });

  it('용어 바로가기는 전부 화면에 있는 용어로 이어진다', async () => {
    const { container } = await renderGlossary();
    const toc = screen.getByRole('navigation', { name: '용어 바로가기' });
    const hrefs = within(toc).getAllByRole('link').map((a) => a.getAttribute('href')!);
    expect(hrefs).toEqual(GLOSSARY_TERMS.map((term) => `#${term.id}`));
    for (const href of hrefs) expect(container.querySelector(href)).not.toBeNull();
  });

  it('대회 스태프 설명은 스태프 지정까지만 말하고 운영 계정·어드민 권한을 약속하지 않는다', async () => {
    const { container } = await renderGlossary();
    const text = container.querySelector('main')?.textContent ?? '';
    expect(text).toContain('대회 스태프로 지정');
    for (const phrase of ['운영 계정', '어드민 권한', '관리자 권한']) expect(text).not.toContain(phrase);
  });
});
