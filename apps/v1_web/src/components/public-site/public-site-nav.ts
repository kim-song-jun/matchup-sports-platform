import { AUDIENCE_PAGES } from '@/lib/public-content/audiences';
import type { PublicLink } from '@/lib/public-content/types';

/* 서비스 소개·이용 대상·도움말·문의 링크는 /landing(A안) 내비가 아직 쓴다. 공용 GNB 는 매치·대회·팀·이용 안내만 쓴다. */
export const PUBLIC_NAV_ABOUT: PublicLink = { href: '/landing', label: '서비스 소개' };
export const PUBLIC_NAV_AUDIENCE_LABEL = '이용 대상';
export const PUBLIC_NAV_AUDIENCES: readonly PublicLink[] = AUDIENCE_PAGES.map((page) => ({
  href: page.path,
  label: page.navLabel,
}));
export const PUBLIC_NAV_HELP: PublicLink = { href: '/help', label: '도움말' };
export const PUBLIC_NAV_CONTACT: PublicLink = { href: '/contact', label: '문의' };

/** 공용 GNB 의 매치·대회·팀 대분류. 라벨은 짧게, 설명은 <1024 메뉴의 큰 행에서만 보여준다. */
export type PublicNavService = PublicLink & { readonly description: string };
export const PUBLIC_NAV_SERVICES: readonly PublicNavService[] = [
  { href: '/team-matches', label: '매치', description: '혼자여도 근처 경기에 바로 신청해요' },
  { href: '/tournaments', label: '대회', description: '대진표·실시간 스코어·순위를 한눈에' },
  { href: '/teams', label: '팀', description: '팀원·명단·전적을 한곳에서' },
];

export const PUBLIC_NAV_GUIDE_LABEL = '이용 안내';
export const PUBLIC_NAV_GUIDES: readonly PublicLink[] = [
  { href: '/help', label: '시작 가이드' },
  { href: '/faq', label: '자주 묻는 질문' },
  { href: '/help/glossary', label: '용어집' },
  { href: '/contact', label: '문의' },
];

/**
 * 현재 페이지로 표시할 링크 하나. 하위 경로(/help/guides/...)에서도 상위 메뉴(/help)가 켜지되,
 * 겹치는 링크가 여럿이면(/help 와 /help/glossary) 가장 긴 것 하나만 켠다.
 */
export function currentNavHref(hrefs: readonly string[], currentPath: string | undefined): string | undefined {
  if (!currentPath) return undefined;
  return hrefs
    .filter((href) => currentPath === href || currentPath.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export const PUBLIC_FOOTER_GROUPS: readonly { readonly title: string; readonly links: readonly PublicLink[] }[] = [
  {
    title: '서비스',
    links: [...PUBLIC_NAV_SERVICES.map(({ href, label }) => ({ href, label })), PUBLIC_NAV_ABOUT],
  },
  {
    title: PUBLIC_NAV_GUIDE_LABEL,
    links: [...PUBLIC_NAV_GUIDES, { href: '/notices', label: '공지사항' }],
  },
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
