import type { ReactNode } from 'react';
import { TournamentAdminShell } from './tournament-admin-shell';

interface Props {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * 대회 상세 공통 셸. 헤더·상태 변경·섹션 내비는 여기서 한 번만 그리고, 섹션별 화면은
 * 하위 라우트가 채운다 — 예전에는 탭 10개와 그 내용이 한 컴포넌트(4,526줄)에 있었다.
 */
export default async function AdminTournamentDetailLayout({ children, params }: Props) {
  const { id } = await params;
  return <TournamentAdminShell id={id}>{children}</TournamentAdminShell>;
}
