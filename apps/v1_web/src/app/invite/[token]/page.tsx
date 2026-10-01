import type { Metadata } from 'next';
import { TeamInviteLandingClient } from '@/components/teams/team-invite-landing-client';

// 주소 자체가 초대 토큰이라 검색에 잡히면 안 된다.
export const metadata: Metadata = {
  title: '팀 초대',
  robots: { index: false, follow: false },
};

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TeamInviteLandingClient token={token} />;
}
