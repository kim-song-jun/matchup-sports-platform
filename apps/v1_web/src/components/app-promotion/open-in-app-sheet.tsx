'use client';

import { Bell, CalendarDays, X, Zap } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { IOS_APP_STORE_URL } from '@/lib/app-store-links';
import { detectNativeShell } from '@/lib/native-bridge';
import {
  isExcludedOpenInAppPath,
  isIosMobileUserAgent,
  OPEN_IN_APP_DELAY_MS,
  OPEN_IN_APP_DISMISSED_KEY,
} from './open-in-app-eligibility';

// sessionStorage 를 못 쓰는 환경(사파리 개인 모드 등)에서는 같은 페이지 수명 동안만 다시 안 띄운다.
let dismissedInMemory = false;

function wasDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return window.sessionStorage.getItem(OPEN_IN_APP_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function recordDismissed() {
  dismissedInMemory = true;
  try {
    window.sessionStorage.setItem(OPEN_IN_APP_DISMISSED_KEY, '1');
  } catch {
    // 메모리 플래그가 대신한다.
  }
}

const BENEFITS = [
  { Icon: Bell, text: '경기 시작 전에 알림으로 먼저 알려줘요' },
  { Icon: Zap, text: '실시간 스코어와 기록을 바로 확인해요' },
  { Icon: CalendarDays, text: '내 팀 일정과 명단을 한 곳에서 봐요' },
] as const;

export function OpenInAppSheet() {
  const pathname = usePathname();
  const excluded = isExcludedOpenInAppPath(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (excluded) return;
    if (detectNativeShell() !== null) return;
    if (!isIosMobileUserAgent(window.navigator.userAgent)) return;
    if (wasDismissed()) return;
    const timer = window.setTimeout(() => {
      if (!wasDismissed()) setOpen(true);
    }, OPEN_IN_APP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [excluded]);

  const dismiss = useCallback(() => {
    recordDismissed();
    setOpen(false);
  }, []);

  return (
    <BottomSheet open={open} onClose={dismiss} ariaLabel="팀밋 앱으로 열기">
      <div className="tm-filter-sheet-handle" aria-hidden="true" />
      <div className="tm-filter-sheet-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/icon-192.png"
            alt=""
            width={56}
            height={56}
            style={{ width: 56, height: 56, flexShrink: 0 }}
          />
          <p className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
            팀밋 앱에서 더 편하게 보세요
          </p>
        </div>
        <button type="button" aria-label="닫기" onClick={dismiss} className="tm-btn tm-btn-icon tm-btn-ghost">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <ul style={{ display: 'grid', gap: 12, margin: '16px 0 20px', padding: 0, listStyle: 'none' }}>
        {BENEFITS.map(({ Icon, text }) => (
          <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text)' }}>
            <Icon size={18} aria-hidden="true" style={{ color: 'var(--blue500)', flexShrink: 0 }} />
            <span className="tm-text-body">{text}</span>
          </li>
        ))}
      </ul>
      <a
        href={IOS_APP_STORE_URL}
        onClick={recordDismissed}
        className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
      >
        앱으로 열기
      </a>
      <button type="button" onClick={dismiss} className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block">
        모바일 웹으로 계속 볼게요
      </button>
    </BottomSheet>
  );
}
