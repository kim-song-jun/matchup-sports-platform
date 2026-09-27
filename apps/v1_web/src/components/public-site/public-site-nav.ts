import { AUDIENCE_PAGES } from '@/lib/public-content/audiences';
import type { PublicLink } from '@/lib/public-content/types';

export const PUBLIC_NAV_ABOUT: PublicLink = { href: '/landing', label: '서비스 소개' };
export const PUBLIC_NAV_AUDIENCE_LABEL = '이용 대상';
export const PUBLIC_NAV_AUDIENCES: readonly PublicLink[] = AUDIENCE_PAGES.map((page) => ({
  href: page.path,
  label: page.navLabel,
}));
export const PUBLIC_NAV_HELP: PublicLink = { href: '/help', label: '도움말' };
export const PUBLIC_NAV_CONTACT: PublicLink = { href: '/contact', label: '문의' };

/** 현재 페이지 표시. 하위 경로(/help/guides/...)에서도 상위 메뉴(/help)가 켜진다. */
export function isCurrentNav(href: string, currentPath: string | undefined): boolean {
  if (!currentPath) return false;
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export const PUBLIC_FOOTER_GROUPS: readonly { readonly title: string; readonly links: readonly PublicLink[] }[] = [
  {
    title: '도움말',
    links: [
      { href: '/help', label: '도움말' },
      { href: '/faq', label: '자주 묻는 질문' },
      { href: '/help/glossary', label: '용어집' },
      { href: '/contact', label: '문의하기' },
      { href: '/notices', label: '공지사항' },
    ],
  },
  { title: PUBLIC_NAV_AUDIENCE_LABEL, links: [PUBLIC_NAV_ABOUT, ...PUBLIC_NAV_AUDIENCES] },
  {
    title: '약관·정책',
    links: [
      { href: '/terms?document=terms', label: '서비스 이용약관' },
      { href: '/terms?document=privacy', label: '개인정보처리방침' },
      { href: '/terms?document=location', label: '위치기반서비스 이용약관' },
      { href: '/terms?document=tournament-policy', label: '대회 운영정책' },
      { href: '/account-deletion', label: '계정 삭제 안내' },
    ],
  },
];
