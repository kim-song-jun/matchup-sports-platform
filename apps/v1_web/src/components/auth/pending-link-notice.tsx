'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { clearPendingSocialLink, peekPendingSocialLink, type PendingSocialLinkRead } from '@/lib/pending-social-link';
import { linkProviderLabel } from './sign-in-then-link-copy';

/**
 * 대기 연결 토큰이 있는 동안 로그인 화면들이 보여 주는 안내. 토큰은 이 탭에서 다음에 로그인하는 계정에 붙으므로,
 * 공용 기기에서 앞사람이 남긴 토큰을 알아채고 끊을 수 있어야 한다.
 * 저장소는 브라우저에서만 읽혀 안내는 마운트 뒤에 나타난다. 알림이 아니라 화면에 놓인 문단이라
 * (이 화면들은 이미 role=status 안내를 따로 쓴다) 스크린리더는 화면을 읽으며 만난다.
 */
export function PendingLinkNotice() {
  const [pending, setPending] = useState<PendingSocialLinkRead | null>(null);
  // 만료 표식은 로그인 뒤 리졸버가 소비한다 — 여기서는 보기만 하고, 쓸 수 있는 토큰이 있을 때만 알린다.
  useEffect(() => setPending(peekPendingSocialLink()), []);

  if (!pending || pending.expired) return null;
  return (
    <div className="tm-auth-pending-link">
      <p className="tm-text-label tm-auth-pending-link-message">
        로그인하면 {linkProviderLabel(pending.provider)} 로그인이 이 계정에 연결돼요. 직접 요청한 게 아니라면 연결 안 하기를 눌러 주세요.
      </p>
      <Button
        onClick={() => {
          clearPendingSocialLink();
          setPending(null);
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
