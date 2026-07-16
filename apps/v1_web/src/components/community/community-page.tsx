'use client';

import Link from 'next/link';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, Pin, Send } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { BellIcon, ChatIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { formatChatDate, formatChatTime, shouldShowChatDate } from './chat-message-time';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, NotificationModel, NotificationsViewModel } from './community.types';

export function ChatListPageView({ model }: { model: ChatListViewModel }) {
  return (
    <AppChrome
      title="채팅"
      activeTab="my"
      bottomNav={false}
      backHref="/home"
      showNotifications={false}
    >
      <div className="tm-chat-mobile-pane">
        <ChatListContent model={model} />
      </div>
      <ChatDesktopWorkspace listModel={model} />
    </AppChrome>
  );
}

function ChatListContent({ model, selectedRoomId }: { model: ChatListViewModel; selectedRoomId?: string }) {
  const hasRooms = model.pinnedRooms.length > 0 || model.rooms.length > 0;

  return (
    <div className="tm-chat-list">
          <div className="tm-sport-chip-row" role="group" aria-label="채팅 카테고리 필터">{model.categories.map((category) => <button key={category.label} className={`tm-chip ${category.active ? 'tm-chip-active' : ''}`} type="button" onClick={category.onSelect} aria-pressed={category.active}>{category.label} {category.count}</button>)}</div>
          {model.status === 'loading' ? <PageSkeleton variant="list" /> : null}
          {model.status === 'error' && !hasRooms ? (
            <ErrorState
              message={model.emptyTitle ?? '채팅방을 불러오지 못했어요.'}
              onRetry={model.onRetry}
            />
          ) : model.status !== 'loading' && model.status !== 'error' && !hasRooms ? (
            /* [P2 UX 라이팅] cta 능동형 표현 */
            <EmptyState
              title={model.emptyTitle ?? '아직 채팅방이 없어요'}
              sub={model.emptyBody ?? '매치에 참가하거나 팀에 가입하면 채팅방이 열려요.'}
              cta={model.emptyHref ? '매치 찾아보기' : undefined}
              onCta={model.emptyHref ? () => { window.location.href = model.emptyHref!; } : undefined}
            />
          ) : null}
          {hasRooms ? (
            <>
              {/* (1) pinnedRooms가 있을 때만 '고정' 섹션 헤더를 노출한다.
                  pinnedRooms.length === 0이면 빈 "고정 0" 헤더가 불필요하게 렌더되므로 가드. */}
              {model.pinnedRooms.length > 0 ? (
                <ChatSection title={`고정 ${model.pinnedRooms.length}`}>
                  {model.pinnedRooms.map((room) => <ChatRoomRow key={room.id} room={room} selected={room.id === selectedRoomId} />)}
                </ChatSection>
              ) : null}
              <ChatSection title={`채팅방 ${model.rooms.length}`}>
                {model.rooms.map((room) => <ChatRoomRow key={room.id} room={room} selected={room.id === selectedRoomId} />)}
              </ChatSection>
            </>
          ) : null}
    </div>
  );
}

export function ChatRoomPageView({ model, listModel, roomId }: { model: ChatRoomViewModel; listModel: ChatListViewModel; roomId: string }) {
  /* [P2 마이크로인터랙션] 전송 완료 순간 체크 애니메이션 — sending true→false 전환 감지 */
  const prevSendingRef = useRef(model.sending);
  const threadRef = useRef<HTMLDivElement>(null);
  const [justSent, setJustSent] = useState(false);
  const lastMessageId = model.messages.at(-1)?.id;

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [lastMessageId, model.messages.length, model.status]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || typeof ResizeObserver === 'undefined') return undefined;

    const keepAtBottom = () => {
      thread.scrollTop = thread.scrollHeight;
    };
    const observer = new ResizeObserver(keepAtBottom);
    observer.observe(thread);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (prevSendingRef.current && !model.sending && !model.sendError) {
      setJustSent(true);
      const t = window.setTimeout(() => setJustSent(false), 400);
      return () => window.clearTimeout(t);
    }
    prevSendingRef.current = model.sending;
    return undefined;
  }, [model.sending, model.sendError]);

  return (
    <AppChrome title={model.title} activeTab="my" bottomNav={false} backHref="/chat" showNotifications={false}>
      <div className="tm-chat-desktop-workspace">
        <aside className="tm-chat-desktop-list-pane" aria-label="채팅방 목록">
          <div className="tm-chat-desktop-pane-head">
            <h1 className="tm-text-heading">채팅</h1>
          </div>
          <ChatListContent model={listModel} selectedRoomId={roomId} />
        </aside>
        <section className="tm-chat-desktop-thread-pane" aria-label={`${model.title} 채팅방`}>
      {/*
       * Desktop page head: back link + room title.
       * The mobile .tm-topbar (rendered inside AppChrome) is hidden on desktop,
       * so we need this in-content header to preserve navigation.
       * display:contents on mobile → no layout impact; block flex on desktop.
       */}
      <div className="tm-chat-room-desktop-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/chat" aria-label="채팅 목록으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{model.title}</h1>
      </div>
      <div className="tm-chat-room">
        <div className="tm-chat-context">
          <Link className="tm-card tm-chat-context-card" href={model.context.href}>
            <div className="tm-chat-context-icon"><ChatIcon size={20} strokeWidth={2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body-lg tm-chat-context-title">{model.context.title}</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>{model.context.sub}</div>
            </div>
            <ChevronRightIcon size={18} stroke="var(--text-caption)" />
          </Link>
        </div>
        <div ref={threadRef} className="tm-chat-thread">
          {model.status === 'loading' ? <PageSkeleton variant="list" /> : null}
          {model.status === 'error' && model.messages.length === 0 ? (
            <ErrorState
              message={model.emptyTitle ?? '메시지를 불러오지 못했어요.'}
              onRetry={model.onRetry}
            />
          ) : model.status !== 'loading' && model.status !== 'error' && model.messages.length === 0 ? (
            /* [P2 UX 라이팅] 능동형 */
            <EmptyState
              title={model.emptyTitle ?? '아직 메시지가 없어요'}
              sub={model.emptyBody ?? '먼저 인사를 건네 대화를 시작해요.'}
            />
          ) : null}
          {model.messages.map((message, index) => {
            const showDate = shouldShowChatDate(message.sentAt, model.messages[index - 1]?.sentAt);
            const dateLabel = showDate ? formatChatDate(message.sentAt) : '';
            const timeLabel = formatChatTime(message.sentAt);

            return (
              <Fragment key={message.id}>
                {dateLabel ? (
                  <div className="tm-chat-date-divider" role="separator" aria-label={dateLabel}>
                    <span>{dateLabel}</span>
                  </div>
                ) : null}
                {message.who === 'system' ? (
                  <div className="tm-chat-system-message">
                    <span>{message.body}</span>
                  </div>
                ) : (
                  <div className={`tm-chat-message-row tm-chat-message-row-${message.who}`}>
                    {message.who === 'me' ? (
                      <div className="tm-chat-message-meta">
                        {message.unreadCount ? <span className="tm-chat-read-count">{message.unreadCount}</span> : null}
                        {timeLabel ? <time dateTime={message.sentAt}>{timeLabel}</time> : null}
                      </div>
                    ) : null}
                    <div className={`tm-chat-bubble tm-chat-bubble-${message.who}`}>
                      <div className="tm-text-micro">{message.label}</div>
                      <div className="tm-text-body">{message.body}</div>
                    </div>
                    {message.who === 'other' && timeLabel ? <time className="tm-chat-message-time" dateTime={message.sentAt}>{timeLabel}</time> : null}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
        {model.sendError ? <div className="tm-text-caption" role="status" style={{ textAlign: 'center', color: 'var(--orange500)', padding: '4px 16px' }}>메시지를 전송하지 못했어요. 다시 시도해 주세요.</div> : null}
        {/* 이미지 첨부는 미구현 상태 — aria-label로 준비 중 안내, title 중복 제거 */}
        {/* [P2 마이크로인터랙션] justSent: Send → Check 아이콘 + tm-complete-check 애니메이션 (0.4s) */}
        <div className="tm-chat-inputbar">
          <button className="tm-btn tm-btn-icon tm-btn-neutral" type="button" aria-label="이미지 첨부 (준비 중)" disabled><PlusIcon size={20} strokeWidth={2.2} /></button>
          <input className="tm-chat-input-placeholder tm-create-native-input" value={model.draft ?? ''} onChange={(event) => model.onDraftChange?.(event.target.value)} placeholder="메시지 입력" aria-label="메시지 입력" disabled={model.status === 'error'} />
          <button
            className="tm-btn tm-btn-icon tm-btn-primary"
            type="button"
            aria-label={justSent ? '전송 완료' : '전송'}
            aria-busy={model.sending}
            disabled={!model.onSend || model.sending || model.status === 'error' || !model.draft?.trim()}
            onClick={model.onSend}
          >
            {model.sending ? '...' : justSent ? (
              <span className="tm-complete-check" aria-hidden="true"><Check size={20} strokeWidth={2.5} /></span>
            ) : (
              <Send size={20} strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>
        </section>
      </div>
    </AppChrome>
  );
}

function ChatDesktopWorkspace({ listModel }: { listModel: ChatListViewModel }) {
  return (
    <div className="tm-chat-desktop-workspace">
      <aside className="tm-chat-desktop-list-pane" aria-label="채팅방 목록">
        <div className="tm-chat-desktop-pane-head">
          <h1 className="tm-text-heading">채팅</h1>
        </div>
        <ChatListContent model={listModel} />
      </aside>
      <section className="tm-chat-desktop-thread-pane" aria-label="선택한 채팅방">
        <div className="tm-chat-desktop-unselected">
          <div className="tm-chat-desktop-unselected-icon"><ChatIcon size={24} strokeWidth={2} /></div>
          <div className="tm-text-body-lg">채팅방을 선택해 주세요</div>
          <div className="tm-text-caption">왼쪽 목록에서 대화를 선택하면 메시지를 확인할 수 있어요.</div>
        </div>
      </section>
    </div>
  );
}

export function NotificationsPageView({ model }: { model: NotificationsViewModel }) {
  const groups = Array.from(new Set(model.notifications.map((notification) => notification.group)));
  const allRead = model.unreadCount === 0;
  return (
    <AppChrome
      title={<span>알림 <span className={`tm-notification-count ${allRead ? 'tm-notification-count-muted' : ''}`}>{model.unreadCount}</span></span>}
      activeTab="my"
      bottomNav={false}
      backHref="/home"
      showNotifications={false}
      topbarActions={(
        <button
          className="tm-btn tm-btn-sm tm-btn-ghost"
          type="button"
          disabled={allRead || !model.onReadAll || model.readAllPending}
          onClick={model.onReadAll}
        >
          {model.readAllPending ? '읽는 중' : '모두 읽기'}
        </button>
      )}
    >
      {/*
       * Desktop column wrapper — display:contents on mobile, centered block on desktop.
       * Also provides the desktop page head (back + title + read-all action)
       * since the mobile topbar is hidden at ≥1024px.
       */}
      <div className="tm-notifications-desktop-wrap">
        {/* Desktop page head: only visible on desktop (tm-show-desktop) */}
        <div className="tm-notifications-desktop-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/home" aria-label="홈으로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.2} />
          </Link>
          <div className="tm-notifications-desktop-head-title">
            <h1 className="tm-text-heading" style={{ margin: 0 }}>
              알림{' '}
              <span className={`tm-notification-count ${allRead ? 'tm-notification-count-muted' : ''}`}>
                {model.unreadCount}
              </span>
            </h1>
          </div>
          <div className="tm-notifications-desktop-head-actions">
            <button
              className="tm-btn tm-btn-sm tm-btn-ghost"
              type="button"
              disabled={allRead || !model.onReadAll || model.readAllPending}
              onClick={model.onReadAll}
            >
              {model.readAllPending ? '읽는 중' : '모두 읽기'}
            </button>
          </div>
        </div>
        <div className="tm-notification-list">
          {/* 로딩 중에는 EmptyState 노출을 막는다 — ready 이후에만 빈 상태를 판정한다 */}
          {model.status === 'loading' ? (
            <PageSkeleton variant="list" />
          ) : model.status === 'error' ? (
            <ErrorState
              message="알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
              onRetry={model.onRetry}
            />
          ) : model.notifications.length === 0 ? (
            /* [P2 UX 라이팅] 능동형 */
            <EmptyState title="아직 알림이 없어요" sub="매치, 팀매치, 채팅에 새 소식이 생기면 여기서 바로 알려드려요." />
          ) : (
            groups.map((group) => {
              const items = model.notifications.filter((notification) => notification.group === group);
              if (items.length === 0) return null;
              const headingId = `notif-group-${group.replace(/\s+/g, '-')}`;
              return (
                <section key={group} className="tm-notification-section" aria-labelledby={headingId}>
                  <div id={headingId} className="tm-text-label">{group}</div>
                  <div className="tm-notification-stack">
                    {items.map((notification) => <NotificationCard key={notification.id} notification={notification} onOpen={model.onOpen} />)}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
      {model.readAllToastVisible ? <div className="tm-notification-toast" role="status">모든 알림을 읽었어요</div> : null}
    </AppChrome>
  );
}

function ChatSection({ title, children }: { title: string; children: ReactNode }) {
  /* useId(): 다중 인스턴스 렌더 시 id 충돌 방지 (v1-coding-patterns §3) */
  const labelId = useId();
  return (
    <section className="tm-chat-section" aria-labelledby={labelId}>
      <div id={labelId} className="tm-chat-section-label">{title}</div>
      <div className="tm-chat-card-stack">{children}</div>
    </section>
  );
}


function ChatRoomRow({ room, selected = false }: { room: ChatRoomModel; selected?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const actionWidth = 72;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    if ((event.target as HTMLElement).closest('button') && !isOpen) return;
    startXRef.current = event.clientX;
    draggingRef.current = true;
    movedRef.current = false;
    const initialOffset = isOpen ? -actionWidth : 0;
    dragOffsetRef.current = initialOffset;
    setDragOffset(initialOffset);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const deltaX = event.clientX - startXRef.current;
    if (Math.abs(deltaX) > 4) movedRef.current = true;
    const baseOffset = isOpen ? -actionWidth : 0;
    const nextOffset = Math.max(-actionWidth, Math.min(0, baseOffset + deltaX));
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const deltaX = event.clientX - startXRef.current;
    const shouldOpen = deltaX < -16 || (deltaX <= 16 && dragOffsetRef.current < -actionWidth / 2);
    setIsOpen(shouldOpen);
    const settledOffset = shouldOpen ? -actionWidth : 0;
    dragOffsetRef.current = settledOffset;
    setDragOffset(settledOffset);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!movedRef.current) return;
    event.preventDefault();
    movedRef.current = false;
  };

  const handleTogglePin = (event: MouseEvent<HTMLButtonElement>) => {
    if (movedRef.current) {
      event.preventDefault();
      movedRef.current = false;
      return;
    }
    setIsOpen(false);
    setDragOffset(0);
    dragOffsetRef.current = 0;
    room.onTogglePin?.();
  };

  const offset = draggingRef.current ? dragOffset : isOpen ? -actionWidth : 0;

  return (
    <div className={`tm-chat-row ${room.unread ? 'tm-chat-row-unread' : ''} ${selected ? 'tm-chat-row-selected' : ''}`}>
      <div
        className="tm-chat-row-swipe"
        style={{
          transform: `translateX(${offset}px)`,
          transition: draggingRef.current ? 'none' : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <Link className="tm-chat-row-main" href={`/chat/${room.id}`} onClick={handleClick} aria-current={selected ? 'page' : undefined}>
          <div className="tm-chat-avatar" style={room.avatarUrl ? { backgroundImage: cssUrl(room.avatarUrl) } : undefined}>{room.avatarUrl ? null : room.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><div className="tm-text-body-lg tm-chat-row-title">{room.title}</div>{room.pinned ? <span className="tm-badge tm-badge-blue tm-chat-pinned-badge">고정</span> : null}</div>
            <div className="tm-chat-last-line" style={{ marginTop: 3 }}>
              <span className="tm-chat-room-type">{room.type}</span>
              <span className={`tm-chat-last-message ${room.unread > 0 ? 'tm-chat-last-message-unread' : ''}`}>{room.last}</span>
              {/* (2) 모바일: last-line 안에서 배지 노출. 데스크톱에서는 meta 열로 이동하므로 숨긴다. */}
              {room.unread > 0 ? <span className="tm-chat-inline-unread tm-hide-desktop" aria-label={`읽지 않은 메시지 ${room.unread}개`}>{room.unread}</span> : null}
            </div>
          </div>
          {/* (2) 데스크톱: 타임스탬프 아래에 배지를 배치. meta 열이 column flex이므로 자연스럽게 적층된다. */}
          <div className="tm-chat-row-meta">
            <div className="tm-text-micro">{room.time}</div>
            {room.unread > 0 ? <span className="tm-chat-inline-unread tm-show-desktop" aria-label={`읽지 않은 메시지 ${room.unread}개`}>{room.unread}</span> : null}
          </div>
        </Link>
        <div className="tm-chat-row-actions" aria-label={`${room.title} 채팅방 작업`}>
          <button
            className={`tm-chat-row-action ${room.pinned ? 'tm-chat-row-action-active' : ''}`}
            type="button"
            aria-label={room.pinned ? `${room.title} 고정 해제` : `${room.title} 고정`}
            title={room.pinned ? '고정 해제' : '고정'}
            disabled={room.actionPending}
            onClick={handleTogglePin}
          >
            <Pin size={18} strokeWidth={2.1} />
            <span>{room.pinned ? '고정 해제' : '고정'}</span>
          </button>
          {/*
            앱 알림 등록 전까지 채팅방별 알림 설정은 숨긴다.
            앱 푸시 연동 후 BellOff import와 onToggleMute 버튼을 복구한다.
          */}
          {/* <button className="tm-chat-row-action" type="button" disabled={room.actionPending} onClick={room.onToggleMute}><BellOff size={18} strokeWidth={2.2} /><span>{room.muted ? '앱 알림켜기' : '앱 알림끄기'}</span></button> */}
        </div>
      </div>
    </div>
  );
}

function NotificationCard({ notification, onOpen }: { notification: NotificationModel; onOpen?: (notification: NotificationModel) => void }) {
  return (
    <Link
      className={`tm-notification-card ${notification.unread ? 'tm-notification-card-unread' : ''}`}
      href={notification.href}
      onClick={(event) => {
        if (!onOpen) return;
        event.preventDefault();
        onOpen(notification);
      }}
    >
      <div className="tm-notification-icon" aria-hidden="true"><BellIcon size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 읽지 않음 상태를 컬러 외에 텍스트로도 전달 — 컬러만 의존 금지 */}
        {notification.unread ? <span className="sr-only">읽지 않음</span> : null}
        <div className="tm-text-body-lg">{notification.title}</div>
        <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{notification.body}</div>
        <div className="tm-notification-meta">{notification.time}</div>
      </div>
    </Link>
  );
}
