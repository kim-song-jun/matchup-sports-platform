'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

function textOf(element: Element | null) {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function isListPath(path: string) {
  return path === '/matches' || path === '/team-matches' || path === '/teams';
}

function isBackLabel(label: string) {
  const normalized = label.toLowerCase();
  return normalized === 'back' || normalized.includes('back') || label.includes('뒤로');
}

function isSearchLabel(label: string, text: string) {
  const normalized = label.toLowerCase();
  return normalized.includes('search') || label.includes('검색') || text === '검색' || text === '더보기';
}

function isNotificationLabel(label: string) {
  const normalized = label.toLowerCase();
  return normalized.includes('notification') || normalized.includes('bell') || label.includes('알림');
}

function isFilterLabel(label: string, text: string) {
  const normalized = label.toLowerCase();
  return normalized.includes('filter') || label.includes('필터') || text.includes('필터');
}

function isChatLabel(label: string, text: string) {
  const normalized = label.toLowerCase();
  return normalized.includes('chat') || label.includes('채팅') || hasAny(text, ['채팅', '문의', '전송']);
}

export function DesignInteractions({ children }: { children: ReactNode }) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const action = target.closest('button, a, [role="button"], .tm-card-interactive');

    if (!action) {
      return;
    }

    const label = action.getAttribute('aria-label') ?? '';
    const text = textOf(action);
    const currentPath = window.location.pathname;
    const shellText = textOf(action.closest('.design-click-layer'));

    const go = (href: string) => {
      event.preventDefault();
      router.push(href);
    };

    if (isBackLabel(label)) {
      event.preventDefault();
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push('/home');
      }
      return;
    }

    if (currentPath.startsWith('/search') && action.closest('form')) {
      return;
    }

    if (isNotificationLabel(label)) {
      go('/notifications');
      return;
    }

    if (currentPath === '/chat' && action.matches('button') && !isBackLabel(label) && !isSearchLabel(label, text) && !isNotificationLabel(label)) {
      go('/chat/sample');
      return;
    }

    if (isFilterLabel(label, text)) {
      if (currentPath.includes('team-matches')) {
        go('/team-matches/filter');
        return;
      }
      if (currentPath.includes('teams')) {
        go('/teams/filter');
        return;
      }
      if (currentPath.includes('matches')) {
        go('/matches/filter');
        return;
      }
    }

    if (isSearchLabel(label, text)) {
      if (isListPath(currentPath) && (label.toLowerCase().includes('submit') || label.includes('실행') || text === '더보기')) {
        return;
      }
      go('/search');
      return;
    }

    if (text === '홈') {
      go('/home');
      return;
    }

    if (text === '매치') {
      go('/matches');
      return;
    }

    if (text === '팀매치') {
      go('/team-matches');
      return;
    }

    if (text === '팀') {
      go('/teams');
      return;
    }

    if (text === '마이') {
      go('/my');
      return;
    }

    if (text.includes('전체보기')) {
      const sectionText = textOf(action.closest('[style*="padding"]') ?? action.parentElement);
      if (sectionText.includes('공지')) {
        go('/notices');
        return;
      }
      if (currentPath.includes('team-matches')) {
        go('/team-matches');
        return;
      }
      if (currentPath.includes('teams')) {
        go('/teams');
        return;
      }
      go('/matches');
      return;
    }

    if (text.includes('모두읽음')) {
      go('/notifications/read');
      return;
    }

    if (isChatLabel(label, text)) {
      go('/chat/sample');
      return;
    }

    if (hasAny(text, ['성수 러너스 FC', '주말 풋살 매치', '마포 풋살 팀매치'])) {
      go('/chat/sample');
      return;
    }

    if (currentPath === '/notifications' && hasAny(text, ['매치 참가 확정', '팀 초대', '리뷰 요청'])) {
      if (text.includes('팀 초대')) {
        go('/teams/sample');
        return;
      }
      if (text.includes('리뷰 요청')) {
        go('/my');
        return;
      }
      go('/matches/sample');
      return;
    }

    if (currentPath === '/notices' && hasAny(text, ['이번 주 고정 공지', '체크인', '운영 안내'])) {
      go('/notices/sample');
      return;
    }

    if (currentPath === '/search') {
      if (text.includes('팀매치')) {
        go('/team-matches/sample');
        return;
      }
      if (hasAny(text, ['팀 보기', '성수 러너스 FC'])) {
        go('/teams/sample');
        return;
      }
      if (hasAny(text, ['매치', '개인매치', '풋살'])) {
        go('/matches/sample');
        return;
      }
    }

    if (hasAny(text, ['매치 만들기', '경기 만들기'])) {
      go('/matches/new');
      return;
    }

    if (text.includes('팀매치 만들기')) {
      go('/team-matches/new');
      return;
    }

    if (text.includes('팀 만들기')) {
      go('/teams/new');
      return;
    }

    if (hasAny(text, ['결제하고 참가하기', '참가하기', '신청 완료', '승인중', '승인완료'])) {
      go('/matches/sample');
      return;
    }

    if (hasAny(text, ['결제하고 신청하기', '신청하기', '상대팀 신청'])) {
      go(currentPath.includes('team') ? '/team-matches/sample' : '/matches/sample');
      return;
    }

    if (hasAny(text, ['팀 보기', '가입 가능 여부 확인', '가입 가능여부 확인'])) {
      go('/teams/sample');
      return;
    }

    if (hasAny(text, ['수정', '관리'])) {
      if (currentPath.includes('team-matches')) {
        go('/team-matches/sample/edit');
        return;
      }
      if (currentPath.includes('/my/teams')) {
        go('/my/teams/members');
        return;
      }
      if (currentPath.includes('teams') || shellText.includes('팀')) {
        go('/teams/sample/members');
        return;
      }
      go('/matches/sample/edit');
    }
  }

  return (
    <div className="design-click-layer" onClickCapture={handleClick}>
      {children}
    </div>
  );
}
