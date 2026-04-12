'use client';

import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const ChatRoomEmbed = dynamic(
  () => import('./chat-room-embed'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    ),
  }
);

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const chatRoomId = params.id as string;

  return (
    <>
      {/* Desktop: full-height embedded in layout */}
      <div className="hidden lg:flex lg:flex-col lg:h-[calc(100dvh-5rem)] lg:-my-10 lg:-mx-8 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
        <ChatRoomEmbed
          chatRoomId={chatRoomId}
          embedded={true}
          onBack={() => router.push('/chat')}
        />
      </div>

      {/* Mobile: full-screen overlay — covers layout footer & bottom nav */}
      <div className="lg:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-gray-900">
        <ChatRoomEmbed
          chatRoomId={chatRoomId}
          embedded={false}
          onBack={() => router.back()}
        />
      </div>
    </>
  );
}
