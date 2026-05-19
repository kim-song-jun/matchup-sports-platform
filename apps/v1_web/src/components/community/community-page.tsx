import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { BellIcon, ChevronRightIcon, PlusIcon } from '@/components/v1-ui/icons';
import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel, NotificationModel, NotificationsViewModel } from './community.types';

export function ChatListPageView({ model }: { model: ChatListViewModel }) {
  return (
    <AppChrome
      title="채팅"
      activeTab="my"
      bottomNav={false}
      backHref="/home"
      hasNewNotification
      floatingSlot={<ChatRoomFloatingButton />}
    >
      <div className="tm-chat-list">
        <div className="tm-sport-chip-row">{model.categories.map((category) => <button key={category.label} className={`tm-chip ${category.active ? 'tm-chip-active' : ''}`} type="button">{category.label} {category.count}</button>)}</div>
        <div className="tm-chat-section-label">고정 {model.pinnedRooms.length}</div>
        {model.pinnedRooms.map((room) => <ChatRoomRow key={room.id} room={room} />)}
        <div className="tm-chat-section-label">채팅방 {model.rooms.length}</div>
        {model.rooms.map((room) => <ChatRoomRow key={room.id} room={room} />)}
      </div>
    </AppChrome>
  );
}

function ChatRoomFloatingButton() {
  return (
    <Link className="tm-floating-fab" href="/chat/room-1" aria-label="채팅 열기">
      <PlusIcon size={25} strokeWidth={2.2} />
    </Link>
  );
}

export function ChatRoomPageView({ model }: { model: ChatRoomViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="my" bottomNav={false} backHref="/chat">
      <div className="tm-chat-room">
        <div className="tm-chat-context">
          <Link className="tm-card tm-chat-context-card" href={model.context.href}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body-lg">{model.context.title}</div>
              <div className="tm-text-caption" style={{ marginTop: 3 }}>{model.context.sub}</div>
            </div>
            <ChevronRightIcon size={18} stroke="var(--text-caption)" />
          </Link>
        </div>
        <div className="tm-chat-thread">{model.messages.map((message) => <div key={message.id} className={`tm-chat-bubble tm-chat-bubble-${message.who}`}><div className="tm-text-micro">{message.label}</div><div className="tm-text-body">{message.body}</div></div>)}</div>
      </div>
      <div className="tm-chat-inputbar"><button className="tm-btn tm-btn-icon tm-btn-neutral" type="button" aria-label="이미지 추가">+</button><div className="tm-chat-input-placeholder">메시지 입력</div><button className="tm-btn tm-btn-icon tm-btn-primary" type="button" aria-label="전송">↑</button></div>
    </AppChrome>
  );
}

export function NotificationsPageView({ model }: { model: NotificationsViewModel }) {
  const groups = ['오늘', '어제'] as const;
  return (
    <AppChrome title={`알림 ${model.unreadCount}`} activeTab="my" bottomNav={false} backHref="/home">
      <div className="tm-notification-list">
        <div className="tm-notification-toolbar"><span className="tm-text-caption">{model.unreadCount > 0 ? '읽지 않은 알림이 있습니다.' : '모든 알림을 확인했습니다.'}</span><Link className="tm-btn tm-btn-sm tm-btn-ghost" href="/notifications/read">모두읽음</Link></div>
        {groups.map((group) => {
          const items = model.notifications.filter((notification) => notification.group === group);
          return <section key={group} style={{ marginTop: 18 }}><div className="tm-text-label" style={{ marginBottom: 8 }}>{group}</div><div style={{ display: 'grid', gap: 8 }}>{items.map((notification) => <NotificationCard key={notification.id} notification={notification} />)}</div></section>;
        })}
      </div>
    </AppChrome>
  );
}

function ChatRoomRow({ room }: { room: ChatRoomModel }) {
  return (
    <Link className={`tm-chat-row ${room.unread ? 'tm-chat-row-unread' : ''}`} href={`/chat/${room.id}`}>
      <div className="tm-chat-avatar">{room.initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><div className="tm-text-body-lg line-clamp-2">{room.title}</div>{room.pinned ? <span className="tm-badge tm-badge-blue">고정</span> : null}</div>
        <div className="tm-text-caption line-clamp-2" style={{ marginTop: 3 }}>{room.type} · {room.last}</div>
      </div>
      <div className="tm-chat-row-meta"><div className="tm-text-micro">{room.time}</div>{room.unread > 0 ? <div className="tm-chat-unread">{room.unread}</div> : null}</div>
    </Link>
  );
}

function NotificationCard({ notification }: { notification: NotificationModel }) {
  return (
    <Link className={`tm-notification-card ${notification.unread ? 'tm-notification-card-unread' : ''}`} href={notification.title.includes('메시지') ? '/chat/room-1' : '/matches/match-1'}>
      <div className="tm-notification-icon"><BellIcon size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body-lg">{notification.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{notification.body}</div>
        <div className="tm-text-micro" style={{ marginTop: 6 }}>{notification.time}</div>
      </div>
    </Link>
  );
}
