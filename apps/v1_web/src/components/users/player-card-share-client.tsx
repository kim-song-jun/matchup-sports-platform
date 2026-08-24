'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { PlayerCard } from './player-card';
import type { V1PlayerCard } from '@/types/api';

/**
 * 선수 카드 공유 화면 (Task 155).
 *
 * 카드 한 장 + 공유 버튼만 둔다. 링크를 받은 사람이 눌렀을 때 미리보기에서 본 것과
 * 같은 것이 그대로 보이는 게 이 화면의 전부다.
 *
 * ## 공유 버튼이 하는 일
 * 모바일에서는 OS 공유 시트(`navigator.share`)를 연다 -- 카카오톡으로 바로 보낼 수
 * 있는 유일한 경로다. 데스크톱은 공유 시트가 없거나 파일 공유를 못 하므로
 * **링크 복사로 대체**한다. 둘 다 안 되면 버튼이 아무 말 없이 실패하지 않도록
 * 복사 실패를 화면에 알린다.
 */
export function PlayerCardShareClient({
  userId,
  card,
  displayName,
  profileImageUrl,
  teamName,
}: {
  readonly userId: string;
  readonly card: V1PlayerCard;
  readonly displayName: string;
  readonly profileImageUrl: string | null;
  readonly teamName: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  const shareUrl = typeof window === 'undefined' ? '' : window.location.href;
  const shareText =
    card.overall != null
      ? `${displayName} · 종합 ${card.overall} — Teameet 선수 카드`
      : `${displayName}의 Teameet 선수 카드`;

  async function onShare() {
    setNotice(null);
    // navigator.share 는 사용자 제스처 안에서만 동작한다 -- 클릭 핸들러에서 바로 부른다.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareText, text: shareText, url: shareUrl });
        return;
      } catch (error) {
        // 사용자가 공유 시트를 닫은 것(AbortError)은 실패가 아니다 -- 조용히 끝낸다.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // 그 외 실패는 아래 복사 경로로 내려간다.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice('링크를 복사했어요');
    } catch {
      setNotice('링크를 복사하지 못했어요. 주소창의 주소를 직접 복사해 주세요.');
    }
  }

  return (
    <AppChrome title="선수 카드" activeTab="my" bottomNav={false} backHref={`/users/${userId}`} desktopHead>
      <div className="tm-my-shell">
        <PlayerCard
          card={card}
          displayName={displayName}
          profileImageUrl={profileImageUrl}
          teamName={teamName}
          isOwner={false}
        />

        <button type="button" className="tm-player-card-share-btn" onClick={onShare}>
          카드 공유하기
        </button>

        {notice ? (
          <div role="status" className="tm-text-caption" style={{ textAlign: 'center' }}>
            {notice}
          </div>
        ) : null}

        <Link href={`/users/${userId}`} className="tm-player-card-share-secondary">
          프로필 전체 보기
        </Link>
      </div>
    </AppChrome>
  );
}
