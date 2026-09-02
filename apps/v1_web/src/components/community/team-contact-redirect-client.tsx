'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useV1ResolveChatRoom } from '@/hooks/use-v1-api';
import { chatRoomHref } from '@/lib/chat-route';
import { extractErrorMessage } from '@/lib/error-message';

/**
 * 옛 컨택 상세 경로(`/my/team-contacts/:contactId`) → 그 컨택의 채팅방.
 * 새 컨택은 요청 시점에 방이 생기고, 백필은 requested/accepted 컨택만 채운다. 그래서 백필
 * 전에 이미 거절·철회·만료된 레거시 컨택은 여기서 resolve 가 create 경로를 타 요청 메시지 없는
 * 방이 생긴다 — 상태 카드는 정상 렌더되므로 스펙 §3.7 대로 감수한다.
 */
export function TeamContactRedirectClient({ contactId }: { contactId: string }) {
  const router = useRouter();
  const resolveChatRoom = useV1ResolveChatRoom();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    resolveChatRoom.mutate(
      { targetType: 'team_contact', targetId: contactId },
      {
        onSuccess: (room) => router.replace(chatRoomHref(room.roomId, room.route)),
        onError: (err) => setError(extractErrorMessage(err, '컨택 대화방을 열지 못했어요. 권한이 없거나 삭제된 컨택일 수 있어요.')),
      },
    );
  }, [contactId, resolveChatRoom, router]);

  if (error) {
    return (
      <div className="tm-my-shell" style={{ display: 'grid', gap: 12 }}>
        <ErrorState message={error} />
        <Link className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" href="/chat?category=team_contact">채팅 목록으로</Link>
      </div>
    );
  }
  return <PageSkeleton variant="list" />;
}
