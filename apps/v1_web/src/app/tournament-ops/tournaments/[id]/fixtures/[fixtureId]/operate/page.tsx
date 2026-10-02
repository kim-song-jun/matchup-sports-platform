import { OperateConsole } from '@/components/tournament-live/operate/operate-console';

interface Props {
  params: Promise<{ id: string; fixtureId: string }>;
}

/**
 * 스태프용 경기 콘솔 진입점. 같은 화면이 어드민의
 * `/admin/tournaments/[id]/live/fixtures/[fixtureId]/operate` 에도 있다 — 구현은 하나이고
 * 경로만 둘이다. 스태프는 마이페이지에서 이 경로로 들어오므로 일반 사용자 화면에
 * 관리자 URL 을 노출하지 않는다.
 */
export default async function TournamentFixtureOperatePage({ params }: Props) {
  const { id, fixtureId } = await params;
  return <OperateConsole tournamentId={id} fixtureId={fixtureId} />;
}
