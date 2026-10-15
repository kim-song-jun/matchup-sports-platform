import type { ReactNode } from 'react';
import { LeagueAdminShell } from './league-admin-shell';

interface Props {
  children: ReactNode;
  params: Promise<{ leagueId: string }>;
}

/**
 * 리그 상세 공통 셸. 헤더·상태 변경·공개 설정·섹션 내비는 여기서 한 번만 그리고, 섹션별 화면은
 * 하위 라우트가 채운다(대회 상세의 `[id]/layout.tsx` 와 같은 구조).
 */
export default async function AdminLeagueDetailLayout({ children, params }: Props) {
  const { leagueId } = await params;
  return <LeagueAdminShell leagueId={leagueId}>{children}</LeagueAdminShell>;
}
