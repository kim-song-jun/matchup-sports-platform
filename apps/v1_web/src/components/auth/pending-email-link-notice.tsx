'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { clearPendingEmailLink, readPendingEmailLinkWithExpiry } from '@/lib/pending-email-link';
import { peekPendingSocialLink } from '@/lib/pending-social-link';
import { remainingTimePhrase } from './remaining-time-phrase';

const NOTICE_REFRESH_MS = 30_000;

type Notice = { email: string | null; expiresAtMs: number };

/**
 * 번호 겹침 안내에서 이메일 연결을 이어 가겠다고 고른 뒤 로그인 화면들이 보여 주는 안내. 보관한 뜻은 이 탭에서 다음에
 * 로그인하는 계정에 이어지므로, 공용 기기에서 앞사람이 남긴 것을 알아채고 끊을 수 있어야 한다.
 * 저장소는 브라우저에서만 읽혀 안내는 마운트 뒤에 나타난다. 화면을 열어 둔 채 시간이 지나도 남은 시간이 거짓이 되지 않게
 * 주기적으로 다시 읽는다. 소셜 연결 대기가 함께 있으면 로그인 뒤 그 결과가 먼저 처리되고 이메일 뜻은 버려지므로 안내하지 않는다.
 */
export function PendingEmailLinkNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let expiryTimer: number | undefined;
    // 한 번 읽을 때 기준 시각은 하나다 — 저장소 만료 판정과 남은 시간 계산이 서로 다른 시각을 보면 경계에서 어긋난다.
    const refresh = () => {
      const nowMs = Date.now();
      const pending = readPendingEmailLinkWithExpiry(nowMs);
      setNow(nowMs);
      const expiresAtMs = pending ? Date.parse(pending.expiresAt) : null;
      setNotice(pending && expiresAtMs !== null && peekPendingSocialLink() === null ? { email: pending.email, expiresAtMs } : null);
      // 주기 갱신을 기다리지 않고 만료 시각에 바로 거둔다.
      window.clearTimeout(expiryTimer);
      if (expiresAtMs !== null) expiryTimer = window.setTimeout(refresh, Math.max(0, expiresAtMs - nowMs) + 1);
    };
    refresh();
    const timer = window.setInterval(refresh, NOTICE_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(expiryTimer);
    };
  }, []);

  if (!notice) return null;
  const timeLimit = remainingTimePhrase(notice.expiresAtMs, now);
  return (
    <div className="tm-auth-pending-link">
      <p className="tm-text-label tm-auth-pending-link-message">
        {notice.email === null
          ? `${timeLimit} 로그인하면 이메일 연결을 이어서 도와요. 연결할 이메일은 로그인한 뒤에 직접 적어요.`
          : `${timeLimit} 로그인하면 ${notice.email} 연결을 이어서 도와요. 시간이 지나면 이 안내는 사라져요.`}
      </p>
      <Button
        onClick={() => {
          clearPendingEmailLink();
          setNotice(null);
        }}
        size="md"
        type="button"
        variant="ghost"
      >
        연결 안 하기
      </Button>
    </div>
  );
}
