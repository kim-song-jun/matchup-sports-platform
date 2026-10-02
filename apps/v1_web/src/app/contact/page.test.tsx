import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { audienceBySlug } from '@/lib/public-content/audiences';
import { faqById } from '@/lib/public-content/faq';
import { organizationId } from '@/lib/structured-data';
import { CONTACT_HEADING, CONTACT_LEAD } from './contact-content';
import ContactPage, { metadata, revalidate } from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
const session = vi.hoisted(() => ({ signedIn: false }));
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => session.signedIn }));

const SITE_INFO = {
  companyName: '가상 회사',
  contactEmail: 'help@example.com',
  guestInquiryRetentionDays: 365,
};

/** 호출마다 새 응답 — 한 테스트에서 페이지를 두 번 그리면 같은 Response 본문을 두 번 읽지 못한다. */
function stubSiteInfo(response: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response.clone()));
}

beforeEach(() => {
  session.signedIn = false;
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
  stubSiteInfo(new Response(JSON.stringify({ status: 'success', data: SITE_INFO }), { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderPage() {
  const page = await ContactPage();
  return render(<ThemeProvider>{page}</ThemeProvider>);
}

function contactPageLd(container: HTMLElement) {
  const nodes = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? ''));
  return nodes.filter((node) => node['@type'] === 'ContactPage');
}

describe('/contact', () => {
  it('메타는 정적이고 canonical 이 /contact 다', () => {
    expect(metadata.title).toBe('문의하기');
    expect(metadata.description).toBe(CONTACT_LEAD);
    expect(metadata.alternates?.canonical).toBe('/contact');
  });

  it('빌드 타임에 프리렌더하지 않는다 — API 없는 빌드가 폼 없는 화면을 굽는다', () => {
    expect(revalidate).toBe(0);
  });

  it('로그인·비로그인 창구 카드를 둘 다 서버에서 그리고, 이메일은 사이트 정보 값을 쓴다', async () => {
    await renderPage();
    const member = screen.getByRole('region', { name: '로그인했다면 1:1 문의' });
    expect(within(member).getByRole('link', { name: '1:1 문의 쓰기' })).toHaveAttribute('href', '/my/inquiries/new');
    expect(within(member).getByRole('link', { name: '내 문의 보기' })).toHaveAttribute('href', '/my/inquiries');
    const guest = screen.getByRole('region', { name: '로그인하지 않았다면 이메일' });
    expect(within(guest).getByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
    expect(within(guest).getByRole('link', { name: '로그인하고 1:1 문의' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fmy%2Finquiries%2Fnew',
    );
  });

  it('로그인 흔적이 있으면 1:1 문의를, 없으면 이메일을 기본으로 고르고 두 창구 카드는 그대로 둔다', async () => {
    session.signedIn = true;
    const { container, unmount } = await renderPage();
    await waitFor(() => expect(container.querySelector('[data-viewer]')).toHaveAttribute('data-viewer', 'member'));
    expect(screen.getByRole('radio', { name: /1:1 문의/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /이메일/ })).not.toBeChecked();
    expect(screen.getByRole('region', { name: '로그인하지 않았다면 이메일' })).toBeInTheDocument();
    unmount();

    session.signedIn = false;
    const second = await renderPage();
    await waitFor(() => expect(second.container.querySelector('[data-viewer]')).toHaveAttribute('data-viewer', 'guest'));
    expect(screen.getByRole('radio', { name: /이메일/ })).toBeChecked();
    expect(screen.getByRole('region', { name: '로그인했다면 1:1 문의' })).toBeInTheDocument();
  });

  it('창구 고르기는 라디오 묶음이라 다른 창구로 바꿀 수 있다(흔적이 틀려도 막히지 않는다)', async () => {
    session.signedIn = true;
    const user = userEvent.setup();
    await renderPage();
    const group = screen.getByRole('group', { name: '문의 창구' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: /1:1 문의/ })).toBeChecked());
    await user.click(within(group).getByRole('radio', { name: /이메일/ }));
    expect(within(group).getByRole('radio', { name: /이메일/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /1:1 문의/ })).not.toBeChecked();
  });

  it('ContactPage JSON-LD 는 화면 제목·소개와 같고, 회사는 전역 Organization 을 가리킨다', async () => {
    const { container } = await renderPage();
    const [ld, ...rest] = contactPageLd(container);
    expect(rest).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ld.name);
    expect(ld.name).toBe(CONTACT_HEADING);
    expect(screen.getByText(ld.description)).toBeInTheDocument();
    expect(ld.about).toEqual({ '@id': organizationId() });
    expect(ld.mainEntity).toEqual({ '@id': organizationId() });
    expect(JSON.stringify(ld)).not.toMatch(/"Organization"|contactPoint/);
  });

  it('#hosting 에 문의 폼이 있고 보관 기간은 사이트 정보 값이다', async () => {
    await renderPage();
    const hosting = document.getElementById('hosting');
    expect(hosting).not.toBeNull();
    const form = within(hosting!).getByRole('form', { name: '대회 개설·제휴 문의 보내기' });
    expect(within(form).getByText('문의 처리 완료 후 1년')).toBeInTheDocument();
  });

  it('보관 기간을 못 읽으면 폼을 열지 않고 이메일 창구만 안내한다(보관 기간을 지어내지 않는다)', async () => {
    stubSiteInfo(new Response('', { status: 404 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderPage();
    const hosting = document.getElementById('hosting')!;
    expect(within(hosting).queryByRole('form')).toBeNull();
    expect(within(hosting).getByText('지금은 이메일로 받아요')).toBeInTheDocument();
    expect(hosting.textContent).not.toMatch(/보관 기간/);
  });

  it('대회 개설 안내: 도입 3단계와 접힌 "아직 지원하지 않는 것"(항목은 HTML 에 있다)', async () => {
    await renderPage();
    const hosting = document.getElementById('hosting')!;
    const organizers = audienceBySlug('organizers');
    const steps = within(hosting).getByRole('list', { name: '이렇게 시작해요' });
    expect(within(steps).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent))
      .toEqual(organizers.steps.map((step) => step.title));
    const notYet = hosting.querySelector<HTMLDetailsElement>('details.tm-ps-honest')!;
    expect(notYet.open).toBe(false);
    for (const item of organizers.notYet) expect(notYet.textContent).toContain(item.body);
  });

  it('자주 묻는 질문은 제자리에서 펼치고, 접혀 있어도 답이 HTML 에 있다', async () => {
    const { container } = await renderPage();
    const faq = container.querySelector<HTMLElement>('#contact-faq')!;
    const items = [...faq.querySelectorAll<HTMLDetailsElement>('details.tm-ps-faq-item')];
    expect(items.map((item) => item.id)).toEqual([
      'entry-fee-refund', 'result-correction', 'how-to-sign-up', 'delete-account', 'host-a-competition',
    ]);
    for (const item of items) {
      expect(item.open).toBe(false);
      expect(item.querySelector('.tm-ps-faq-answer')?.textContent).toContain(faqById(item.id)!.answer[0]);
    }
  });

  it('지킬 수 없는 약속(운영 계정·어드민 권한·실시간·답변 시간·앱 스토어)을 쓰지 않는다', async () => {
    const { container } = await renderPage();
    // 문의 페이지 본문만 본다 — 공용 GNB 의 대회 설명("실시간 스코어")은 라이브 스코어 기능 이야기다
    const text = container.querySelector('main')?.textContent ?? '';
    for (const phrase of ['운영 계정', '어드민 권한', '관리자 권한', '실시간', 'AI 매칭', '시간 안에', '앱 스토어', 'App Store', 'Google Play']) {
      expect(text, phrase).not.toContain(phrase);
    }
    // 환불 처리 기간(영업일 3~7일)은 FAQ 답으로 싣는다 — 막을 것은 답변 시간 약속이다
    expect(text).not.toMatch(/\d+\s*(시간|영업일)\s*(이내|안에)\s*(답|회신)/);
    expect(text).toContain('대회 스태프로 지정해 드려요');
  });
});
