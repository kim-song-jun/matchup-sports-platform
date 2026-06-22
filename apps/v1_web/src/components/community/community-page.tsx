'use client';

import Link from 'next/link';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Pin, Send, X } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { BellIcon, ChatIcon, ChevronLeftIcon, ChevronRightIcon, MatchIcon, PlusIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, NotificationModel, NotificationsViewModel } from './community.types';

/* #23: 나가기 확인 시트 — a11y 보강 (ESC 핸들러 + 취소 버튼 autoFocus + role=dialog/aria-modal) */
function LeaveConfirmSheet({
  title,
  body,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  pending: boolean | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pending, onCancel]);

  return (
    <div className="tm-chat-leave-scrim" role="presentation" onClick={pending ? undefined : onCancel}>
      <div
        className="tm-chat-leave-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tm-text-body-lg">{title}</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>{body}</div>
        <button
          className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block"
          style={{ marginTop: 16 }}
          type="button"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? '나가는 중' : '나가기'}
        </button>
        {/* autoFocus: 파괴적 액션이 기본 포커스를 받지 않도록 안전 버튼(취소)으로 초기 포커스 이동 */}
        <button
          className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block"
          style={{ marginTop: 8 }}
          type="button"
          disabled={pending}
          onClick={onCancel}
          autoFocus
        >
          취소
        </button>
      </div>
    </div>
  );
}

export function ChatListPageView({ model }: { model: ChatListViewModel }) {
  const hasRooms = model.pinnedRooms.length > 0 || model.rooms.length > 0;

  return (
    <AppChrome
      title="채팅"
      activeTab="my"
      bottomNav={false}
      backHref="/home"
      showNotifications={false}
    >
      {/* Desktop column wrapper — display:contents on mobile, block column on desktop */}
      <div className="tm-chat-desktop-wrap">
        <div className="tm-chat-list">
          <div className="tm-sport-chip-row" role="group" aria-label="채팅 카테고리 필터">{model.categories.map((category) => <button key={category.label} className={`tm-chip ${category.active ? 'tm-chip-active' : ''}`} type="button" onClick={category.onSelect} aria-pressed={category.active}>{category.label} {category.count}</button>)}</div>
          {model.status === 'loading' ? <ChatEmptyState title="채팅방을 불러오고 있어요" body="잠시만 기다려 주세요." /> : null}
          {model.status !== 'loading' && !hasRooms ? <ChatEmptyState title={model.emptyTitle ?? '아직 채팅방이 없어요'} body={model.emptyBody ?? '매치에 참가하거나 팀에 가입하면 채팅방이 생겨요.'} href={model.emptyHref} onRetry={model.onRetry} /> : null}
          {hasRooms ? (
            <>
              {/* (1) pinnedRooms가 있을 때만 '고정' 섹션 헤더를 노출한다.
                  pinnedRooms.length === 0이면 빈 "고정 0" 헤더가 불필요하게 렌더되므로 가드. */}
              {model.pinnedRooms.length > 0 ? (
                <ChatSection title={`고정 ${model.pinnedRooms.length}`}>
                  {model.pinnedRooms.map((room) => <ChatRoomRow key={room.id} room={room} />)}
                </ChatSection>
              ) : null}
              <ChatSection title={`채팅방 ${model.rooms.length}`}>
                {model.rooms.map((room) => <ChatRoomRow key={room.id} room={room} />)}
              </ChatSection>
            </>
          ) : null}
        </div>
      </div>
      {model.leaveConfirm ? (
        <LeaveConfirmSheet
          title={model.leaveConfirm.title}
          body={model.leaveConfirm.body}
          pending={model.leaveConfirm.pending}
          onConfirm={model.leaveConfirm.onConfirm}
          onCancel={model.leaveConfirm.onCancel}
        />
      ) : null}
    </AppChrome>
  );
}

export function ChatRoomPageView({ model }: { model: ChatRoomViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="my" bottomNav={false} backHref="/chat" showNotifications={false}>
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
        <div className="tm-chat-thread">
          {model.status === 'loading' ? <ChatEmptyState title="메시지를 불러오고 있어요" body="잠시만 기다려 주세요." /> : null}
          {model.status !== 'loading' && model.messages.length === 0 ? <ChatEmptyState title={model.emptyTitle ?? '아직 메시지가 없어요'} body={model.emptyBody ?? '첫 메시지를 보내 대화를 시작할 수 있어요.'} onRetry={model.onRetry} /> : null}
          {model.messages.map((message) => <div key={message.id} className={`tm-chat-bubble tm-chat-bubble-${message.who}`}><div className="tm-text-micro">{message.label}</div><div className="tm-text-body">{message.body}</div></div>)}
        </div>
        {model.sendError ? <div className="tm-text-caption" role="status" style={{ textAlign: 'center', color: 'var(--orange500)', padding: '4px 16px' }}>메시지를 전송하지 못했어요. 다시 시도해 주세요.</div> : null}
        {/* 이미지 첨부는 미구현 상태 — aria-label로 준비 중 안내, title 중복 제거 */}
        <div className="tm-chat-inputbar"><button className="tm-btn tm-btn-icon tm-btn-neutral" type="button" aria-label="이미지 첨부 (준비 중)" disabled><PlusIcon size={20} strokeWidth={2.2} /></button><input className="tm-chat-input-placeholder tm-create-native-input" value={model.draft ?? ''} onChange={(event) => model.onDraftChange?.(event.target.value)} placeholder="메시지 입력" aria-label="메시지 입력" disabled={model.status === 'error'} /><button className="tm-btn tm-btn-icon tm-btn-primary" type="button" aria-label="전송" aria-busy={model.sending} disabled={!model.onSend || model.sending || model.status === 'error' || !model.draft?.trim()} onClick={model.onSend}>{model.sending ? '...' : <Send size={20} strokeWidth={2.2} />}</button></div>
      </div>
    </AppChrome>
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
            <EmptyState title="알림이 없어요" sub="매치, 팀매치, 채팅 알림이 오면 여기서 확인할 수 있어요." />
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

function ChatEmptyState({ title, body, href, onRetry }: { title: string; body: string; href?: string; onRetry?: () => void }) {
  return (
    <div className="tm-chat-empty">
      <div className="tm-chat-empty-icon"><ChatIcon size={28} strokeWidth={1.9} /></div>
      <div className="tm-text-heading">{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>{body}</div>
      {onRetry ? <button className="tm-btn tm-btn-md tm-btn-primary" type="button" onClick={onRetry}>다시 시도</button> : null}
      {!onRetry && href ? <Link className="tm-btn tm-btn-md tm-btn-primary" href={href}><MatchIcon size={16} strokeWidth={2} />추천 매치 보기</Link> : null}
    </div>
  );
}

function ChatRoomRow({ room }: { room: ChatRoomModel }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const actionWidth = 144;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
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

  const offset = draggingRef.current ? dragOffset : isOpen ? -actionWidth : 0;

  return (
    <div className={`tm-chat-row ${room.unread ? 'tm-chat-row-unread' : ''}`}>
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
        <Link className="tm-chat-row-main" href={`/chat/${room.id}`} onClick={handleClick}>
          <div className="tm-chat-avatar" style={room.avatarUrl ? { backgroundImage: cssUrl(room.avatarUrl) } : undefined}>{room.avatarUrl ? null : room.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><div className="tm-text-body-lg tm-chat-row-title">{room.title}</div>{room.pinned ? <span className="tm-badge tm-badge-blue">고정</span> : null}</div>
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
          <button className="tm-chat-row-action" type="button" disabled={room.actionPending} onClick={room.onTogglePin}><Pin size={18} strokeWidth={2.1} /><span>{room.pinned ? '고정 해제' : '고정'}</span></button>
          <button className="tm-chat-row-action tm-chat-row-action-danger" type="button" disabled={room.actionPending} onClick={room.onRequestLeave}><X size={18} strokeWidth={2.2} /><span>나가기</span></button>
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
