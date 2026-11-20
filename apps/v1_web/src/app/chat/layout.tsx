import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { MemberAccessChatGate } from '@/components/admin/member-access-chat-gate';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <RequireAuth><MemberAccessChatGate>{children}</MemberAccessChatGate></RequireAuth>;
}
