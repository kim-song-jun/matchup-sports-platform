import { RequireAuth } from '@/components/auth/require-auth';
import { GameRosterClient } from './game-roster-client';

/** 대회·리그 경기 명단(Task 176). 알림 딥링크가 이 경로를 쓴다(`lineup-todo.service.ts` rosterScreenPath). */
export default async function TeamGameRosterPage({
  params,
}: {
  params: Promise<{ id: string; gameId: string }>;
}) {
  const { id, gameId } = await params;
  return (
    <RequireAuth>
      <GameRosterClient teamId={id} gameId={gameId} />
    </RequireAuth>
  );
}
