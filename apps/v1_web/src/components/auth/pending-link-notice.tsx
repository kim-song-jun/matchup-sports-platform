'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { clearPendingSocialLink, readPendingSocialLink, type PendingSocialLink } from '@/lib/pending-social-link';
import { linkProviderLabel } from './sign-in-then-link-copy';

/**
 * 대기 연결 토큰이 있는 동안 로그인 화면들이 보여 주는 안내. 토큰은 이 탭에서 다음에 로그인하는 계정에 붙으므로,
 * 공용 기기에서 앞사람이 남긴 토큰을 알아채고 끊을 수 있어야 한다. 저장소는 브라우저에서만 읽혀 마운트 뒤에 나타난다.
 */
export function PendingLinkNotice() {
  const [pending, setPending] = useState<PendingSocialLink | null>(null);
  useEffect(() => setPending(readPendingSocialLink()), []);

  if (!pending) return null;
  return (
    <div className="tm-auth-pending-link" style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '16px 0' }}>
      <AlertBanner
        tone="info"
        message={`로그인하면 ${linkProviderLabel(pending.provider)} 로그인이 이 계정에 연결돼요. 직접 요청한 게 아니라면 연결 안 하기를 눌러 주세요.`}
      />
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
