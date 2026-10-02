/**
 * 용어집의 DefinedTermSet 은 "정규 리그란?" 같은 개념 질문의 인용 원천이다. LD 의 용어·정의·별칭이
 * 화면과 어긋나거나 @id 앵커가 없는 곳을 가리키면 인용 링크가 깨진다.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { GLOSSARY_GROUPS, GLOSSARY_TERMS } from '@/lib/public-content/glossary';
import { termSearchEntries } from '@/lib/public-site/help-index';
import { matchHelpEntries } from '@/lib/public-site/help-search';
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

afterEach(() => {
  window.history.replaceState(null, '', '/');
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
      expect(term.name).toBe(item.querySelector('h3')?.textContent);
      expect(term.description).toBe(item.querySelector('.tm-help-term-def')?.textContent);
      expect(new URL(term['@id']).hash).toBe(`#${item.id}`);
      const alias = item.querySelector('.tm-help-term-alias')?.textContent ?? null;
      expect(alias).toBe(term.alternateName ? `같은 뜻: ${term.alternateName.join(', ')}` : null);
    });
  });

  it('용어는 분류 묶음 안에 놓이고, 분류 칩을 고르면 다른 묶음만 가린다', async () => {
    const user = userEvent.setup();
    const { container } = await renderGlossary();
    for (const group of GLOSSARY_GROUPS) {
      const ids = [...container.querySelectorAll(`#group-${group.id} li.tm-help-term`)].map((li) => li.id);
      expect(ids).toEqual(GLOSSARY_TERMS.filter((term) => term.group === group.id).map((term) => term.id));
    }
    expect(screen.getByRole('status')).toHaveTextContent(`용어 ${GLOSSARY_TERMS.length}개`);

    await user.click(within(screen.getByRole('group', { name: '분류로 좁혀 보기' })).getByRole('button', { name: '매치' }));
    const visible = [...container.querySelectorAll('li.tm-help-term')].filter((li) => !li.closest('[hidden]'));
    expect(visible.map((li) => li.id)).toEqual(GLOSSARY_TERMS.filter((term) => term.group === 'match').map((term) => term.id));
    expect(screen.getByRole('status')).toHaveTextContent(`용어 ${visible.length}개`);
  });

  it('검색어에 맞는 용어만 남기고, 가려진 용어를 #id 로 가리키면 검색어를 지워 보이게 한다', async () => {
    const user = userEvent.setup();
    const { container } = await renderGlossary();
    const input = screen.getByLabelText('용어 검색');
    await user.type(input, '승강');
    const keys = matchHelpEntries(termSearchEntries(GLOSSARY_TERMS), '승강')!;
    const expected = GLOSSARY_TERMS.filter((term) => keys.has(`term:${term.id}`)).map((term) => term.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(GLOSSARY_TERMS.length);
    const visibleIds = () =>
      [...container.querySelectorAll('li.tm-help-term')].filter((li) => !li.closest('[hidden]')).map((li) => li.id);
    expect(visibleIds()).toEqual(expected);

    const hiddenTerm = GLOSSARY_TERMS.find((term) => !keys.has(`term:${term.id}`))!;
    act(() => {
      window.history.replaceState(null, '', `/help/glossary#${hiddenTerm.id}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(input).toHaveValue('');
    expect(visibleIds()).toEqual(GLOSSARY_TERMS.map((term) => term.id));
  });

  it('대회 스태프 설명은 스태프 지정까지만 말하고 운영 계정·어드민 권한을 약속하지 않는다', async () => {
    const { container } = await renderGlossary();
    const text = container.querySelector('main')?.textContent ?? '';
    expect(text).toContain('대회 스태프로 지정');
    for (const phrase of ['운영 계정', '어드민 권한', '관리자 권한']) expect(text).not.toContain(phrase);
  });
});
