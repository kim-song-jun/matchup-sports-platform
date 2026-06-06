import Link from 'next/link';
import { ChatIcon } from '@/components/v1-ui/icons';
import { AppChrome } from '@/components/v1-ui/shell';
import { HomeOpenDesignContent } from './home-desktop-sections';
import type { HomeViewModel } from './home.types';

export function HomePageView({ model }: { readonly model: HomeViewModel }) {
  return (
    <AppChrome
      title="teameet"
      activeTab="home"
      showSearch
      hasNewNotification={model.hasNewNotification && !model.network}
      floatingSlot={<HomeChatFloatingButton model={model} />}
    >
      <HomeOpenDesignContent model={model} />
    </AppChrome>
  );
}

function HomeChatFloatingButton({ model }: { readonly model: HomeViewModel }) {
  return (
    <Link className="tm-floating-fab tm-home-chat-fab" href={model.chatHref} aria-label={`채팅 ${model.chatUnreadCount}개 읽지 않음`}>
      <ChatIcon size={22} strokeWidth={2.2} />
      {model.chatUnreadCount > 0 ? <span className="tm-floating-count tab-num">{model.chatUnreadCount}</span> : null}
    </Link>
  );
}
