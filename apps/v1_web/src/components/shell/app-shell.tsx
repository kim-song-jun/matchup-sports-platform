'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Bell, ChevronLeft, Home, Search, ShieldCheck, Swords, Trophy, Users } from 'lucide-react';

const tabs = [
  { href: '/home', label: '홈', icon: Home },
  { href: '/matches', label: '매치', icon: Trophy },
  { href: '/team-matches', label: '팀매치', icon: Swords },
  { href: '/teams', label: '팀', icon: Users },
  { href: '/my', label: '마이', icon: ShieldCheck },
];

const titleByPath = [
  { path: '/admin', title: '관리', eyebrow: 'v1 최소 운영 화면' },
  { path: '/notifications', title: '알림', eyebrow: '읽음과 이동을 분리해서 처리' },
  { path: '/chat', title: '채팅', eyebrow: '매치와 팀매치 연결 채팅' },
  { path: '/notices', title: '공지사항', eyebrow: 'v1 운영 안내' },
  { path: '/search', title: '검색', eyebrow: '매치, 팀매치, 팀 통합 탐색' },
  { path: '/team-matches', title: '팀매치', eyebrow: '상대 팀 찾기' },
  { path: '/matches', title: '개인 매치', eyebrow: '함께 뛸 사람 찾기' },
  { path: '/teams', title: '팀 둘러보기', eyebrow: '가입 승인 기반 팀' },
  { path: '/my/settings', title: '설정', eyebrow: '계정과 알림 상태' },
  { path: '/my/profile', title: '프로필', eyebrow: '표시 정보와 신뢰 상태' },
  { path: '/my', title: '마이', eyebrow: '활동과 신뢰 상태' },
  { path: '/home', title: 'teameet', eyebrow: 'SM New v1' },
];

function getHeader(pathname: string) {
  return titleByPath.find((item) => pathname.startsWith(item.path)) ?? titleByPath[titleByPath.length - 1];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const header = getHeader(pathname);
  const isSearchPage = pathname.startsWith('/search');
  const showBack = isSearchPage || pathname.split('/').filter(Boolean).length > 1;

  return (
    <div className="v1-root">
      <div className="v1-frame">
        <header className="v1-header">
          <div className="v1-brand">
            <p className="v1-eyebrow">{header.eyebrow}</p>
            <div className="v1-title-row">
              {showBack ? (
                <Link className="v1-back-button" href={isSearchPage ? '/home' : '..'} aria-label="뒤로가기">
                  <ChevronLeft size={20} />
                </Link>
              ) : null}
              <h1 className="v1-title">{header.title}</h1>
            </div>
          </div>
          <div className="v1-header-actions" aria-label="공통 동작">
            <Link className="v1-icon-button" href="/search" aria-label="검색">
              <Search size={21} />
            </Link>
            <Link className="v1-icon-button" href="/notifications" aria-label="알림">
              <Bell size={21} />
              <span className="v1-unread-dot" />
            </Link>
          </div>
        </header>
        {children}
        <nav className="v1-bottom-nav" aria-label="주요 메뉴">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              tab.href === '/home' ? pathname === '/home' || pathname === '/' : pathname.startsWith(tab.href);

            return (
              <Link key={tab.href} href={tab.href} className={active ? 'v1-tab v1-tab-active' : 'v1-tab'} aria-current={active ? 'page' : undefined}>
                <Icon size={22} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
