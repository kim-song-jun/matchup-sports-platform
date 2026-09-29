import { RequireAuth } from '@/components/auth/require-auth';
import { TeamGameRostersClient } from './team-game-rosters-client';

/** Task 179 팀 B — 선수 × 다가오는 대회·리그 경기 일괄 관리(팀 운영 메뉴 "경기 명단 관리"). */
export default async function TeamGameRostersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <TeamGameRostersClient teamId={id} />
    </RequireAuth>
  );
}
