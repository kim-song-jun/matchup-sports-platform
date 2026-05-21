import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { BellIcon, ChatIcon, ChevronRightIcon, MatchIcon, PlusIcon } from '@/components/v1-ui/icons';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, NotificationModel, NotificationsViewModel } from './community.types';

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
      <div className="tm-chat-list">
        <div className="tm-sport-chip-row">{model.categories.map((category) => <button key={category.label} className={`tm-chip ${category.active ? 'tm-chip-active' : ''}`} type="button" onClick={category.onSelect}>{category.label} {category.count}</button>)}</div>
        {model.status === 'loading' ? <ChatEmptyState title="채팅방을 불러오는 중입니다" body="잠시만 기다려주세요." /> : null}
        {model.status !== 'loading' && !hasRooms ? <ChatEmptyState title={model.emptyTitle ?? '아직 채팅방이 없어요'} body={model.emptyBody ?? '매치에 참가하거나 팀에 가입하면 채팅방이 생깁니다.'} href={model.emptyHref} onRetry={model.onRetry} /> : null}
        {hasRooms ? (
          <>
            <ChatSection title={`고정 ${model.pinnedRooms.length}`}>
              {model.pinnedRooms.map((room) => <ChatRoomRow key={room.id} room={room} />)}
            </ChatSection>
            <ChatSection title={`채팅방 ${model.rooms.length}`}>
              {model.rooms.map((room) => <ChatRoomRow key={room.id} room={room} />)}
            </ChatSection>
          </>
        ) : null}
      </div>
      {model.leaveConfirm ? (
        <div className="tm-chat-leave-scrim" role="presentation">
          <div className="tm-chat-leave-sheet" role="dialog" aria-modal="true" aria-label={model.leaveConfirm.title}>
            <div className="tm-text-body-lg">{model.leaveConfirm.title}</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>{model.leaveConfirm.body}</div>
            <button className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block" style={{ marginTop: 16 }} type="button" disabled={model.leaveConfirm.pending} onClick={model.leaveConfirm.onConfirm}>{model.leaveConfirm.pending ? '나가는 중' : '나가기'}</button>
            <button className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block" style={{ marginTop: 8 }} type="button" disabled={model.leaveConfirm.pending} onClick={model.leaveConfirm.onCancel}>취소</button>
          </div>
        </div>
      ) : null}
    </AppChrome>
  );
}

export function ChatRoomPageView({ model }: { model: ChatRoomViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="my" bottomNav={false} backHref="/chat" showNotifications={false}>
      <div className="tm-chat-room">
        <div className="tm-chat-context">
          <Link className="tm-card tm-chat-context-card" href={model.context.href}>
            <div className="tm-chat-context-icon"><ChatIcon size={20} strokeWidth={2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body-lg">{model.context.title}</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>{model.context.sub}</div>
            </div>
            <ChevronRightIcon size={18} stroke="var(--text-caption)" />
          </Link>
        </div>
        <div className="tm-chat-thread">{model.messages.map((message) => <div key={message.id} className={`tm-chat-bubble tm-chat-bubble-${message.who}`}><div className="tm-text-micro">{message.label}</div><div className="tm-text-body">{message.body}</div></div>)}</div>
      </div>
      <div className="tm-chat-inputbar"><button className="tm-btn tm-btn-icon tm-btn-neutral" type="button" aria-label="이미지 추가"><PlusIcon size={20} strokeWidth={2.2} /></button><input className="tm-chat-input-placeholder tm-create-native-input" value={model.draft ?? ''} onChange={(event) => model.onDraftChange?.(event.target.value)} placeholder="메시지 입력" /><button className="tm-btn tm-btn-icon tm-btn-neutral" type="button" aria-label="전송" disabled={!model.onSend || model.sending || !model.draft?.trim()} onClick={model.onSend}>{model.sending ? '...' : '전송'}</button></div>
    </AppChrome>
  );
}

export function NotificationsPageView({ model }: { model: NotificationsViewModel }) {
  const groups = ['오늘', '어제'] as const;
  const allRead = model.unreadCount === 0;
  return (
    <AppChrome title={`알림 ${model.unreadCount}`} activeTab="my" bottomNav={false} backHref="/home">
      <div className="tm-notification-list">
        <div className="tm-notification-toolbar"><span className="tm-text-caption">{model.unreadCount > 0 ? '읽지 않은 알림이 있습니다. 알림을 열면 읽음 처리 후 이동합니다.' : '모든 알림을 확인했습니다.'}</span><button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" disabled={allRead || !model.onReadAll || model.readAllPending} onClick={model.onReadAll}>{model.readAllPending ? '처리중' : '모두읽음'}</button></div>
        {allRead ? <div className="tm-notification-toast">모든 알림을 읽음 처리했습니다</div> : null}
        {groups.map((group) => {
          const items = model.notifications.filter((notification) => notification.group === group);
          return <section key={group} style={{ marginTop: 18 }}><div className="tm-text-label" style={{ marginBottom: 8 }}>{group}</div><div style={{ display: 'grid', gap: 8 }}>{items.map((notification) => <NotificationCard key={notification.id} notification={notification} onOpen={model.onOpen} />)}</div></section>;
        })}
      </div>
    </AppChrome>
  );
}

function ChatSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="tm-chat-section"><div className="tm-chat-section-label">{title}</div><div className="tm-chat-card-stack">{children}</div></section>;
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
  return (
    <div className={`tm-chat-row ${room.unread ? 'tm-chat-row-unread' : ''}`}>
      <div className="tm-chat-row-swipe">
        <Link className="tm-chat-row-main" href={`/chat/${room.id}`}>
          <div className="tm-chat-avatar">{room.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><div className="tm-text-body-lg line-clamp-2">{room.title}</div>{room.pinned ? <span className="tm-badge tm-badge-blue">고정</span> : null}</div>
            <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{room.type} · {room.last}</div>
          </div>
          <div className="tm-chat-row-meta"><div className="tm-text-micro">{room.time}</div>{room.unread > 0 ? <div className="tm-chat-unread">{room.unread}</div> : null}</div>
        </Link>
        <div className="tm-chat-row-actions" aria-label={`${room.title} 채팅방 작업`}>
          <button className="tm-chat-row-action" type="button" disabled={room.actionPending} onClick={room.onTogglePin}>{room.pinned ? '고정해제' : '고정'}</button>
          <button className="tm-chat-row-action tm-chat-row-action-danger" type="button" disabled={room.actionPending} onClick={room.onRequestLeave}>나가기</button>
        </div>
      </div>
    </div>
  );
}

function NotificationCard({ notification, onOpen }: { notification: NotificationModel; onOpen?: (notification: NotificationModel) => void }) {
  return (
    <Link className={`tm-notification-card ${notification.unread ? 'tm-notification-card-unread' : ''}`} href={notification.href} onClick={(event) => {
      if (!onOpen) return;
      event.preventDefault();
      onOpen(notification);
    }}>
      <div className="tm-notification-icon"><BellIcon size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body-lg">{notification.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{notification.body}</div>
        <div className="tm-notification-meta"><span>{notification.time}</span><span>{notification.actionLabel}</span></div>
      </div>
    </Link>
  );
}
