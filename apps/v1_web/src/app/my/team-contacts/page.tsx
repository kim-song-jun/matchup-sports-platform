import { redirect } from 'next/navigation';

/**
 * 컨택함은 채팅으로 흡수됐다("팀 컨택의 채팅 흡수" 스펙 §7.5). 이 경로는 DB 에 남아 있는
 * 옛 알림 딥링크와 북마크 호환용으로만 남긴다 — 팀컨택 필터가 걸린 채팅 목록으로 보낸다.
 */
export default function MyTeamContactsPage() {
  redirect('/chat?category=team_contact');
}
