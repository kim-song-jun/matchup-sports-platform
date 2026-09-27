/**
 * /faq 는 사이트에서 FAQPage JSON-LD 를 싣는 유일한 페이지다. 구조화 데이터가 화면에 없는 문장을 담거나
 * 필터 기본값이 질문을 가리면 검색엔진이 스팸으로 보고 AI 가 인용할 원출처가 사라진다.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { FAQ_CATEGORIES, FAQ_ITEMS, FAQ_UPDATED_AT, type FaqCategoryId } from '@/lib/public-content/faq';
import FaqPage, { metadata } from './page';

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

async function renderFaq() {
  const ui = await FaqPage();
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const faqsByCategory = (category: FaqCategoryId) => FAQ_ITEMS.filter((item) => item.category === category);

function ldOfType(container: HTMLElement, type: string) {
  return [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => JSON.parse(node.textContent ?? '{}') as Record<string, unknown>)
    .filter((node) => node['@type'] === type);
}

type LdQuestion = { name: string; url: string; acceptedAnswer: { text: string } };

describe('/faq 메타데이터', () => {
  it('제목·설명·canonical 이 /faq 를 가리키고 색인을 허용한다', () => {
    expect(metadata.title).toBe('자주 묻는 질문');
    expect(metadata.description).toMatch(/^팀밋 가입, 매치 참가/);
    expect(metadata.alternates?.canonical).toBe('/faq');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});

describe('/faq 서버 렌더', () => {
  it('필터 기본값은 전체라 모든 질문이 가려지지 않은 채 id 앵커로 렌더된다', async () => {
    const { container } = await renderFaq();
    const details = [...container.querySelectorAll('details')];
    expect(details.map((node) => node.id)).toEqual(
      FAQ_CATEGORIES.flatMap((category) => faqsByCategory(category.id).map((item) => item.id)),
    );
    expect(details).toHaveLength(FAQ_ITEMS.length);
    expect(details.some((node) => node.closest('[hidden]'))).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(`질문 ${FAQ_ITEMS.length}개`);
  });

  it('FAQPage JSON-LD 는 한 개이고, 질문·답이 화면 텍스트와 1:1 이다', async () => {
    const { container } = await renderFaq();
    const faqLds = ldOfType(container, 'FAQPage');
    expect(faqLds).toHaveLength(1);
    const questions = faqLds[0].mainEntity as LdQuestion[];
    const details = [...container.querySelectorAll('details')];
    expect(questions).toHaveLength(details.length);
    questions.forEach((question, index) => {
      const node = details[index];
      expect(question.name).toBe(node.querySelector('summary')?.textContent);
      // 답은 본문 문단만 — 표·링크 라벨은 LD 에 없어야 한다
      const paragraphs = [...node.querySelectorAll('.tm-ps-faq-answer > p')].map((p) => p.textContent);
      expect(question.acceptedAnswer.text).toBe(paragraphs.join(' '));
      expect(new URL(question.url).hash).toBe(`#${node.id}`);
    });
  });

  it('마지막 업데이트는 콘텐츠 데이터의 갱신일을 그대로 보여 준다', async () => {
    const { container } = await renderFaq();
    expect(container.querySelector('.tm-ps-updated time')?.getAttribute('datetime')).toBe(FAQ_UPDATED_AT);
  });

  it('지킬 수 없는 약속(운영 계정·어드민 권한·AI 매칭·답변 시간·앱 스토어)이 화면에 없다', async () => {
    const { container } = await renderFaq();
    const text = container.querySelector('main')?.textContent ?? '';
    for (const phrase of ['운영 계정', '어드민 권한', '관리자 권한', 'AI 매칭', '앱 스토어', 'App Store', 'Google Play']) {
      expect(text).not.toContain(phrase);
    }
    expect(text).not.toMatch(/\d+\s*(시간|영업일)\s*(이내|안에)\s*(답|회신)/);
  });
});

describe('/faq 주제 필터', () => {
  it('주제를 고르면 다른 주제 묶음만 hidden 으로 가리고 개수를 알린다', async () => {
    const user = userEvent.setup();
    const { container } = await renderFaq();
    const group = screen.getByRole('group', { name: '주제로 좁혀 보기' });
    await user.click(within(group).getByRole('button', { name: '팀' }));

    expect(within(group).getByRole('button', { name: '팀' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false');
    const teamCount = faqsByCategory('team').length;
    expect(screen.getByRole('status')).toHaveTextContent(`질문 ${teamCount}개`);
    const visible = [...container.querySelectorAll('details')].filter((node) => !node.closest('[hidden]'));
    expect(visible.map((node) => node.id)).toEqual(faqsByCategory('team').map((item) => item.id));
    // 가린 질문도 DOM 에는 남는다(딥링크·구조화 데이터와의 일치 유지)
    expect(container.querySelectorAll('details')).toHaveLength(FAQ_ITEMS.length);

    await user.click(within(group).getByRole('button', { name: '전체' }));
    expect(screen.getByRole('status')).toHaveTextContent(`질문 ${FAQ_ITEMS.length}개`);
  });

  it('가려진 질문을 #id 딥링크로 가리키면 전체로 되돌려 그 질문이 보이게 한다', async () => {
    const user = userEvent.setup();
    const { container } = await renderFaq();
    await user.click(screen.getByRole('button', { name: '팀' }));
    const target = container.querySelector<HTMLDetailsElement>('#entry-fee-refund')!;
    expect(target.closest('[hidden]')).not.toBeNull();

    act(() => {
      window.history.replaceState(null, '', '/faq#entry-fee-refund');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(target.closest('[hidden]')).toBeNull();
    expect(target.open).toBe(true);
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  });
});
