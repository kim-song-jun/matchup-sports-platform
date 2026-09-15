import { TeamContactRedirectClient } from '@/components/community/team-contact-redirect-client';

type PageProps = {
  params: Promise<{ contactId: string }>;
};

/**
 * 컨택 상세는 채팅방으로 흡수됐다("팀 컨택의 채팅 흡수" 스펙 §7.5). DB 에 저장된 옛 알림
 * 딥링크(`/my/team-contacts/{id}`)가 계속 살아 있어야 하므로, 컨택 id 로 방을 찾아 보낸다.
 */
export default async function MyTeamContactDetailPage({ params }: PageProps) {
  const { contactId } = await params;
  return <TeamContactRedirectClient contactId={contactId} />;
}
