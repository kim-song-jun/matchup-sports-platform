import { ChatRoomPageClient } from '@/components/community/community-api-clients';

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatRoomPageClient roomId={id} />;
}
