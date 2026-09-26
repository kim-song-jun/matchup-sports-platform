import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
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
  guestInquiryRetention: '문의 처리 완료 후 1년',
};

function stubSiteInfo(response: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response));
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

  it('로그인 흔적에 맞는 카드만 강조하고, 두 카드의 내용은 그대로 둔다', async () => {
    session.signedIn = true;
    const { container } = await renderPage();
    const grid = container.querySelector('[data-viewer]');
    await waitFor(() => expect(grid).toHaveAttribute('data-viewer', 'member'));
    expect(screen.getByRole('region', { name: '로그인하지 않았다면 이메일' })).toBeInTheDocument();
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

  it('지킬 수 없는 약속(운영 계정·어드민 권한·실시간·답변 시간·앱 스토어)을 쓰지 않는다', async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? '';
    for (const phrase of ['운영 계정', '어드민 권한', '관리자 권한', '실시간', 'AI 매칭', '영업일', '시간 안에', '앱 스토어', 'App Store', 'Google Play']) {
      expect(text, phrase).not.toContain(phrase);
    }
    expect(text).toContain('대회 스태프로 지정해 드려요');
  });
});
