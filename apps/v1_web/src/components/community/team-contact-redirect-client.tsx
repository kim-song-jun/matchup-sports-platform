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
 * 방은 요청 시점에 이미 만들어져 있으므로 resolve 는 get-or-create 의 get 경로를 탄다.
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
