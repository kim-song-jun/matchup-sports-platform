'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAccessDeniedError } from '@/lib/access-denied-error';
import { extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { trackEvent } from '@/lib/analytics';
import { normalizeNotificationHref } from '@/lib/notification-route';
import { withFromPath } from '@/lib/session-storage';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { ChatSafetyDialog, type ChatSafetyTarget } from './chat-safety-dialog';
import { useV1ChatRoomSocket } from '@/hooks/use-v1-realtime-socket';
import {
  useV1ChatMessages,
  useV1ChatRoom,
  useV1ChatRooms,
  useV1NotificationsInfinite,
  useV1ReadAllNotifications,
  useV1ReadNotification,
  useV1MyMatches,
  useV1MySchedule,
  useV1SendChatMessage,
  useV1UploadChatFile,
  useV1UploadImages,
  chatMessageFileUrl,
  useV1UpdateChatRoomMe,
  useV1UpdateMyChatRoom,
} from '@/hooks/use-v1-api';
import type { V1ChatMessage, V1ChatRoom, V1Notification } from '@/types/api';
import { ChatListPageView, ChatRoomPageView, NotificationsPageView } from './community-page';
import { formatChatListTimestamp } from './chat-message-time';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, ChatShareCandidate, NotificationModel, NotificationsViewModel } from './community.types';
import { getChatRoomViewModel } from './community.view-model';
import { chatRoomContextSub, chatRoomTypeLabel } from '@/lib/chat-route';
import { displayInitials } from '@/lib/display-initials';
import { MAX_CHAT_IMAGES, formatFileSize } from './chat-plus-panel';

type ChatCategory = ChatRoomModel['type'] | '전체';

const CHAT_AVATARS = {
  개인매치: '/mock/profile/profile-01.svg',
  팀매치: '/mock/profile/profile-03.svg',
  팀: '/mock/profile/profile-02.svg',
  팀컨택: '/mock/profile/profile-02.svg',
} satisfies Record<ChatRoomModel['type'], string>;

export function ChatListPageClient() {
  const model = useChatListPageModel();

  return <ChatListPageView model={model} />;
}

/** `/chat?category=team_contact` — 마이 메뉴·팀 관리 메뉴의 "받은 컨택" 입구가 팀컨택 필터로 바로 연다. */
function initialChatCategory(category: string | null): ChatCategory {
  return category === 'team_contact' ? '팀컨택' : '전체';
}

const CHAT_LIST_PAGE_SIZE = 50;
const CATEGORY_ROOM_TYPE: Record<Exclude<ChatCategory, '전체'>, V1ChatRoom['roomType']> = {
  개인매치: 'match',
  팀매치: 'team_match',
  팀: 'team',
  팀컨택: 'team_contact',
};

function useChatListPageModel(): ChatListViewModel {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  const [selectedCategory, setSelectedCategory] = useState<ChatCategory>(() => initialChatCategory(categoryParam));
  // 이미 /chat 에 있는 채로 쿼리만 바뀌는 이동(/chat → /chat?category=team_contact)은 컴포넌트가
  // 남아 있어 useState 초기값이 다시 계산되지 않는다 — 파라미터 변화에 맞춰 동기화한다.
  useEffect(() => {
    setSelectedCategory(initialChatCategory(categoryParam));
  }, [categoryParam]);
  // 서버 최대 페이지(50)로 받는다. 카테고리를 고르면 서버 roomType 필터로 다시 받는다 — 첫 페이지를
  // 클라이언트에서 거르면 "받은 컨택 3" 배지를 눌렀는데 목록이 비는 일이 생긴다(최종 리뷰 Important 2).
  const query = useV1ChatRooms(undefined, { limit: CHAT_LIST_PAGE_SIZE });
  const filteredQuery = useV1ChatRooms(
    { enabled: selectedCategory !== '전체' },
    selectedCategory === '전체' ? undefined : { roomType: CATEGORY_ROOM_TYPE[selectedCategory], limit: CHAT_LIST_PAGE_SIZE },
  );
  // 종료된 컨택(archived 방)은 요청했을 때만 받는다 — 기본 목록은 서버가 이미 치운 상태다.
  const [showEnded, setShowEnded] = useState(false);
  const endedEnabled = selectedCategory === '팀컨택' && showEnded;
  const endedQuery = useV1ChatRooms(
    { enabled: endedEnabled },
    endedEnabled ? { roomType: 'team_contact', status: 'archived', limit: CHAT_LIST_PAGE_SIZE } : undefined,
  );
  const updateMe = useV1UpdateChatRoomMe();
  const baseRooms = query.data?.items.map(toChatRoomModel) ?? [];
  const categoryRooms = filteredQuery.data?.items.map(toChatRoomModel);
  const withActions = (room: ChatRoomModel) => ({
    ...room,
    actionPending: updateMe.isPending && updateMe.variables?.roomId === room.id,
    onTogglePin: () => updateMe.mutate({ roomId: room.id, pinned: !room.pinned }),
    // 앱 알림 등록 전까지 채팅방별 알림 설정은 비활성화한다.
    // 앱 푸시 연동 후 아래 콜백과 community-page.tsx의 버튼을 함께 복구한다.
    // onToggleMute: () => updateMe.mutate({ roomId: room.id, mutedUntil: room.muted ? null : mutedUntilIndefinite() }),
  });
  const rooms = baseRooms.map(withActions);
  // 서버 필터 응답이 아직 없거나(첫 로딩) 실패했으면 전체 목록을 클라이언트에서 걸러 보여 주고,
  // 도착하면 서버 결과로 바꾼다 — 카테고리를 고를 때 목록이 스켈레톤으로 비지 않게 한다.
  const visibleRooms =
    selectedCategory === '전체'
      ? rooms
      : categoryRooms
        ? categoryRooms.map(withActions)
        : rooms.filter((room) => room.type === selectedCategory);
  const categories: ChatCategory[] = ['전체', '개인매치', '팀매치', '팀', '팀컨택'];
  const isEmpty = visibleRooms.length === 0;
  const model: ChatListViewModel = {
    categories: categories.map((category) => ({
      label: category,
      // '전체' 와 선택된 카테고리(서버 필터 결과)만 센다. 나머지 칩은 첫 50개 안에서만 센 값이라
      // 눌렀을 때 숫자가 바뀌어 보이므로 아예 보여 주지 않는다(후속 리뷰 Important 1).
      count:
        category === '전체'
          ? rooms.length
          : category === selectedCategory
            ? (categoryRooms ?? rooms.filter((room) => room.type === category)).length
            : undefined,
      active: selectedCategory === category,
      onSelect: () => setSelectedCategory(category),
    })),
    pinnedRooms: visibleRooms.filter((room) => room.pinned),
    rooms: visibleRooms.filter((room) => !room.pinned),
    status: query.isPending ? 'loading' : query.isError ? 'error' : 'ready',
    emptyTitle: query.isError ? '채팅방을 불러오지 못했어요' : isEmpty ? `${selectedCategory} 채팅방이 없어요` : undefined,
    emptyBody: query.isError ? '잠시 후 다시 시도해 주세요.' : isEmpty ? '매치에 참가하거나 팀에 가입하면 채팅방이 생겨요.' : undefined,
    emptyHref: query.isError || selectedCategory === '팀' || selectedCategory === '팀컨택' ? undefined : '/matches',
    onRetry: query.isError ? () => query.refetch() : undefined,
    endedContacts:
      selectedCategory === '팀컨택'
        ? {
            visible: showEnded,
            onToggle: () => setShowEnded((v) => !v),
            rooms: showEnded ? (endedQuery.data?.items.map(toChatRoomModel) ?? []).map(withActions) : [],
            status: !showEnded || endedQuery.data ? 'ready' : endedQuery.isError ? 'error' : 'loading',
          }
        : undefined,
  };

  return model;
}

export function ChatRoomPageClient({ roomId }: { roomId: string }) {
  const currentHref = useCurrentHref();
  const [safety, setSafety] = useState<ChatSafetyTarget | 'manage' | null>(null);
  // 실시간 수신. 이 훅은 만들어져 있었지만 **어디에도 마운트되지 않아** 열어 둔 채팅방에
  // 새 메시지가 실시간으로 들어오지 않았다 -- 30초 stale 이 지난 뒤 창 포커스가 바뀔 때만
  // 갱신됐다. 형제 훅(useV1NotificationSocket)은 notification-socket-bridge 로 마운트돼
  // 있는데 이것만 소비처가 없었다.
  useV1ChatRoomSocket(roomId);
  const listModel = useChatListPageModel();
  const room = useV1ChatRoom(roomId);
  const messages = useV1ChatMessages(roomId, { limit: 50 });
  const send = useV1SendChatMessage(roomId);
  // 채팅 사진은 크기와 무관하게 다시 그려 촬영 위치(EXIF GPS)·기기 정보를 지운다.
  const uploadImages = useV1UploadImages({ stripMetadata: true });
  const updateMe = useV1UpdateMyChatRoom(roomId);
  const [draft, setDraft] = useState('');
  const [sendingImages, setSendingImages] = useState(false);
  const uploadFile = useV1UploadChatFile();
  const [sendingFile, setSendingFile] = useState(false);
  const [imageNotice, setImageNotice] = useState<string | undefined>();
  // 일정·매치 공유 시트 — 열 때만 내 팀 일정·내 매치를 불러온다(채팅방을 열 때마다 부르지 않게).
  const [shareOpen, setShareOpen] = useState(false);
  const shareFrom = useMemo(() => new Date().toISOString(), [shareOpen]);
  const mySchedules = useV1MySchedule({ status: 'scheduled', from: shareFrom, limit: 30 }, { enabled: shareOpen });
  const joinedMatches = useV1MyMatches({ mode: 'joined', limit: 30 }, { enabled: shareOpen });
  const createdMatches = useV1MyMatches({ mode: 'created', limit: 30 }, { enabled: shareOpen });
  const items = useMemo(() => [...(messages.data?.items ?? [])].reverse(), [messages.data]);
  const lastMessageId = items.at(-1)?.messageId ?? null;

  useEffect(() => {
    if (!lastMessageId || updateMe.isPending) return;
    updateMe.mutate({ lastReadMessageId: lastMessageId });
  }, [lastMessageId]);

  const fallback = getChatRoomViewModel();
  const contact = room.data?.teamContact ?? null;
  // 컨택 방은 수락된 뒤에만 대화할 수 있다(서버 TEAM_CONTACT_NOT_ACCEPTED 게이트와 같은 규칙).
  const inputLockedMessage = contact
    ? contact.status === 'requested'
      ? '수락하면 대화할 수 있어요'
      : contact.status !== 'accepted'
        ? '종료된 컨택이에요'
        : undefined
    : undefined;
  const isError = room.isError || messages.isError;
  // 팀에서 내보내진 뒤 옛 팀 채팅 주소로 들어온 경우 — 다시 불러와도 같으니 재시도 대신 나갈 길을 준다.
  const accessDenied = isAccessDeniedError(room.error) || isAccessDeniedError(messages.error);
  const isLoading = room.isPending || messages.isPending;
  // fallback은 로딩 중 스켈레톤 배경용 placeholder일 뿐이다 — 조회 실패(isError) 시에도
  // 노출되면 알림으로 들어온 실제 채팅방 대신 엉뚱한 채팅방이 보이는 것처럼 보인다.
  const messageItems = messages.data ? items.map((message) => toChatMessageModel(message, currentHref, roomId)) : isLoading ? fallback.messages : [];
  const shareQueries = [mySchedules, joinedMatches, createdMatches];
  const model: ChatRoomViewModel = {
    onMessageSafety: setSafety,
    onManageBlocked: () => setSafety('manage'),
    title: room.data?.title ?? (isLoading ? fallback.title : '채팅'),
    context: room.data
      ? {
          title: room.data.linkedTarget.title,
          sub: chatRoomContextSub(room.data.roomType),
          // 연결된 화면에서 뒤로가면 이 채팅방으로 돌아온다.
          href: room.data.linkedTarget.route ? withFromPath(room.data.linkedTarget.route, currentHref) : '/chat',
        }
      : isLoading
        ? fallback.context
        : { title: '', sub: '', href: '/chat' },
    teamContact: contact,
    // 더 오래된 메시지가 남아 있으면 여기가 대화의 맨 위가 아니다.
    historyNotice: room.data?.roomType === 'team' && messages.data?.pageInfo?.hasNext !== true ? '들어오기 전 대화는 보이지 않아요' : undefined,
    inputLockedMessage,
    messages: messageItems,
    status: isLoading ? 'loading' : isError ? 'error' : 'ready',
    emptyTitle: accessDenied
      ? '참여 중인 멤버만 볼 수 있어요'
      : isError
        ? '채팅방을 불러오지 못했어요'
        : messages.data && items.length === 0
          ? '아직 메시지가 없어요'
          : undefined,
    emptyBody: accessDenied
      ? '팀에서 빠졌거나 채팅방에서 나가면 이 대화를 볼 수 없어요. 다시 함께하려면 팀에 새로 신청해 주세요.'
      : isError
        ? '네트워크 상태를 확인하고 다시 시도해 주세요.'
        : messages.data && items.length === 0
          ? inputLockedMessage ?? '먼저 말을 걸어 대화를 시작해 보세요'
          : undefined,
    draft,
    sending: send.isPending,
    sendError: send.isError ? extractErrorMessage(send.error, '메시지를 전송하지 못했어요. 다시 시도해 주세요.') : undefined,
    onDraftChange: setDraft,
    onSend: () => {
      const content = draft.trim();
      // 로딩 중 재클릭/재입력 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
      // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
      // 재클릭/재입력은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
      if (!content || send.isPending) return;
      send.mutate(
        { content },
        {
          onSuccess: () => setDraft(''),
        },
      );
    },
    // 사진마다 "올리기 → 보내기"를 차례로 한다 — 말풍선이 사진별로 올라가고(카카오톡처럼), 중간에 실패해도
    // 몇 장이 갔는지 정확히 알려 다시 고를 때 앞 사진이 중복되지 않으며, 올리기만 되고 안 보내진 사진이 쌓이지 않는다.
    onPickImages: async (files) => {
      if (sendingImages || files.length === 0) return;
      const picked = files.slice(0, MAX_CHAT_IMAGES);
      setImageNotice(undefined);
      setSendingImages(true);
      let sent = 0;
      try {
        for (const file of picked) {
          const { urls } = await uploadImages.mutateAsync([file]);
          if (!urls[0]) throw new Error('사진을 올리지 못했어요. 다시 시도해 주세요.');
          await send.mutateAsync({ imageUrl: urls[0] });
          sent += 1;
        }
        if (files.length > MAX_CHAT_IMAGES) {
          setImageNotice(`사진은 한 번에 ${MAX_CHAT_IMAGES}장까지 보낼 수 있어요. 앞의 ${MAX_CHAT_IMAGES}장만 보냈어요.`);
        }
      } catch (err) {
        const reason = extractErrorMessage(err, '사진을 보내지 못했어요. 다시 시도해 주세요.');
        setImageNotice(sent > 0 ? `사진 ${picked.length}장 중 ${sent}장만 보냈어요. ${reason}` : reason);
      } finally {
        setSendingImages(false);
      }
    },
    sendingImages,
    // 파일(Task 181 ③): 올리기 → 보내기. 10MB 넘는 파일은 올리기 전에 막는다(서버도 막지만 기다리지 않게).
    onPickFile: async (file: File) => {
      if (sendingFile) return;
      setImageNotice(undefined);
      if (file.size > CHAT_FILE_MAX_BYTES) {
        setImageNotice('파일은 10MB까지 보낼 수 있어요.');
        return;
      }
      setSendingFile(true);
      try {
        const uploaded = await uploadFile.mutateAsync(file);
        await send.mutateAsync({ fileId: uploaded.fileId });
      } catch (err) {
        setImageNotice(extractErrorMessage(err, '파일을 보내지 못했어요. 다시 시도해 주세요.'));
      } finally {
        setSendingFile(false);
      }
    },
    sendingFile,
    imageNotice,
    share: {
      open: shareOpen,
      onOpen: () => setShareOpen(true),
      onClose: () => setShareOpen(false),
      status: shareQueries.some((query) => query.isError) ? 'error' : shareQueries.some((query) => query.isPending) ? 'loading' : 'ready',
      schedules: (mySchedules.data?.items ?? []).map((item) => ({
        kind: 'team_schedule' as const,
        targetId: item.id,
        title: item.title,
        when: formatTournamentDateTimeShort(item.startAt),
        sub: item.teamName,
      })),
      matches: upcomingMatches([...(joinedMatches.data?.items ?? []), ...(createdMatches.data?.items ?? [])], shareFrom),
      onPick: (candidate: ChatShareCandidate) => {
        setShareOpen(false);
        setImageNotice(undefined);
        send.mutate(
          { share: { kind: candidate.kind, targetId: candidate.targetId } },
          { onError: (err) => setImageNotice(extractErrorMessage(err, '공유하지 못했어요. 다시 시도해 주세요.')) },
        );
      },
      onRetry: () => shareQueries.forEach((query) => void query.refetch()),
    },
    errorBack: accessDenied ? { href: '/chat', label: '채팅 목록으로' } : undefined,
    onRetry: isError && !accessDenied
      ? () => {
          room.refetch();
          messages.refetch();
        }
      : undefined,
  };

  return <><ChatRoomPageView model={model} listModel={listModel} roomId={roomId} />{safety ? <ChatSafetyDialog roomId={roomId} target={safety === 'manage' ? null : safety} onClose={() => setSafety(null)} /> : null}</>;
}

export function NotificationsPageClient() {
  const router = useRouter();
  const [readAllToastVisible, setReadAllToastVisible] = useState(false);
  // "더 보기" 무한 목록 — useV1MyMatchesInfinite/MyMatchesPageClient 와 동일한 패턴.
  const query = useV1NotificationsInfinite();
  const read = useV1ReadNotification();
  const readAll = useV1ReadAllNotifications();

  // 더 보기 실패는 이미 받은 목록을 지우지 않는다 — 전체 에러는 첫 페이지 실패일 때만.
  const status: NotificationsViewModel['status'] = query.isPending
    ? 'loading'
    : query.isError && !query.data
      ? 'error'
      : 'ready';

  // 로딩·에러 중에는 빈 배열을 유지하되 EmptyState를 노출하지 않는다.
  // ready 상태에서만 실제 알림이 없는지 판정한다. 페이지 경계에서 항목이 겹쳐 올 수 있어
  // (invalidate 후 재조회 등) notificationId 기준으로 중복을 제거한다(my-matches-client.tsx 선례).
  const byId = new Map<string, V1Notification>();
  if (status === 'ready' && query.data) {
    for (const item of query.data.pages.flatMap((page) => page.items)) {
      if (!byId.has(item.notificationId)) byId.set(item.notificationId, item);
    }
  }
  const notifications = [...byId.values()].map(toNotificationModel);

  const model: NotificationsViewModel = {
    status,
    onRetry: query.isError ? () => query.refetch() : undefined,
    // unreadCount는 페이지네이션과 무관한 전체 미읽음 수 — 서버가 매 페이지 응답에 동일하게
    // 채워 준다(첫 페이지 값을 쓴다. "모두 읽음" 후에는 무효화로 모든 페이지가 다시 조회돼 0이 된다).
    unreadCount: typeof query.data?.pages[0]?.unreadCount === 'number' ? query.data.pages[0].unreadCount : 0,
    notifications,
    readAllPending: readAll.isPending,
    readAllToastVisible,
    onReadAll: () =>
      readAll.mutate(
        {},
        {
          onSuccess: () => {
            setReadAllToastVisible(true);
            window.setTimeout(() => setReadAllToastVisible(false), 2200);
          },
        },
      ),
    // 카드 탭은 상세 시트를 여는 동작 — 읽음 처리만 하고 이동은 시트 CTA(onNavigate)가 맡는다.
    onOpen: (notification) => {
      trackEvent('notification_click', { type: notification.type });
      if (notification.unread) read.mutate(notification.id);
    },
    onNavigate: (notification) => router.push(notification.href),
    hasNext: query.hasNextPage,
    loadMorePending: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    // Same condition as the button's disabled state — a background refetch must not swallow the tap.
    onLoadMore: () => { if (!query.isFetchingNextPage) void query.fetchNextPage(); },
  };

  return <NotificationsPageView model={model} />;
}

function toChatRoomModel(room: V1ChatRoom): ChatRoomModel {
  const type = chatRoomTypeLabel(room.roomType);
  return {
    id: room.roomId,
    title: room.title,
    type,
    href: room.linkedTarget.route ?? '/chat',
    contactStatus: room.teamContact?.status,
    contactNeedsReply: room.teamContact?.status === 'requested' && room.teamContact.mySide === 'to',
    last: room.lastMessage?.contentPreview ?? '아직 메시지가 없어요',
    time: room.lastMessage ? formatChatListTimestamp(room.lastMessage.sentAt) : '',
    unread: room.unreadCount,
    pinned: room.pinned,
    muted: room.muted,
    mutedUntil: room.mutedUntil ?? null,
    initials: displayInitials(room.title, { fallback: '채' }),
    avatarUrl: CHAT_AVATARS[type],
  };
}

// 앱 푸시 연동 후 채팅방별 알림 끄기 기능을 복구할 때 다시 사용한다.
// function mutedUntilIndefinite() {
//   return '9999-12-31T23:59:59.999Z';
// }

/** 내가 참여·개설한 매치 중 다가오고 취소되지 않은 것만, 중복 없이 빠른 순(서버도 취소 매치 공유를 400 으로 막는다). */
function upcomingMatches(matches: Array<{ id: string; title: string; startsAt: string; placeName: string; status: string }>, fromIso: string): ChatShareCandidate[] {
  const seen = new Set<string>();
  return matches
    .filter((match) => match.status !== 'cancelled' && match.startsAt >= fromIso && !seen.has(match.id) && seen.add(match.id))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((match) => ({
      kind: 'match' as const,
      targetId: match.id,
      title: match.title,
      when: formatTournamentDateTimeShort(match.startsAt),
      sub: match.placeName,
    }));
}

const SHARE_LABEL = { team_schedule: '일정', match: '매치' } as const;
/** 서버 채팅 파일 한도(CHAT_FILE_MAX_BYTES)와 같게. */
const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;

function toChatMessageModel(message: V1ChatMessage, currentHref: string | null, roomId: string): ChatRoomViewModel['messages'][number] {
  if (message.messageType === 'system') {
    return {
      id: message.messageId,
      who: 'system',
      senderId: 'system',
      label: '',
      body: message.content ?? '',
      sentAt: message.sentAt,
    };
  }

  return {
    id: message.messageId,
    who: message.mine ? 'me' : 'other',
    senderId: message.sender.userId,
    unreadCount: message.mine && message.unreadCount ? message.unreadCount : undefined,
    label: message.mine ? '나' : message.sender.displayName,
    body: message.content ?? '삭제된 메시지예요.',
    sentAt: message.sentAt,
    ...(message.messageType === 'image'
      ? {
          kind: 'image' as const,
          imageUrl: message.imageUrl ?? null,
          // 숨김·삭제면 content 가 null 이라 위 '삭제된 메시지예요.' 가 남고, 업로드만 지워졌으면 이 문구다.
          ...(message.content !== null && !message.imageUrl ? { body: '사진을 볼 수 없어요' } : {}),
        }
      : message.messageType === 'file'
        ? {
            kind: 'file' as const,
            file: message.file
              ? { name: message.file.name, sizeLabel: formatFileSize(message.file.size), href: chatMessageFileUrl(roomId, message.messageId) }
              : null,
          }
      : message.messageType === 'share'
        ? {
            kind: 'share' as const,
            // 카드에서 연 화면의 뒤로가기가 이 채팅방으로 돌아오게 출처를 싣는다.
            share: message.shareCard
              ? {
                  label: SHARE_LABEL[message.shareCard.kind],
                  title: message.shareCard.title,
                  when: formatTournamentDateTimeShort(message.shareCard.startAt),
                  place: message.shareCard.place,
                  sub: message.shareCard.sub,
                  href: withFromPath(message.shareCard.route, currentHref),
                }
              : null,
          }
        : {}),
  };
}

function toNotificationModel(notification: V1Notification): NotificationModel {
  const href = normalizeNotificationHref(notification.target?.route, notification.type);
  return {
    id: notification.notificationId,
    type: notification.type,
    group: formatNotificationGroup(notification.createdAt),
    title: notification.title,
    body: notification.body ?? '',
    time: formatRelative(notification.createdAt),
    unread: notification.status !== 'read',
    href,
    actionLabel: notification.type === 'chat' ? '채팅 열기' : '보기',
  };
}

function formatNotificationGroup(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return '오늘';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '어제';

  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatRelative(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
