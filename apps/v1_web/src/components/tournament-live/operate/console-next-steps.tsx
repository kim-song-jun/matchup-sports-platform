'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { findNextFixture } from '@/lib/next-fixture';
import { resolveTournamentLiveBase } from '@/lib/tournament-live-routes';

/**
 * 결과를 확정한 뒤 콘솔에서 이어 갈 곳 — 순위표와 다음 경기. 확정 뒤 "갈 곳이 없던" 막다른
 * 화면을 없애는 자리라, 결과 확정 카드가 확정 상태일 때만 그 옆에 붙는다.
 *
 * 대회/리그 종류와 대진 목록은 셸이 이미 받아 둔 공개 대회 상세(`useV1Tournament`)를 재사용한다.
 */
export function ConsoleNextSteps({ tournamentId, fixtureId }: { tournamentId: string; fixtureId: string }) {
  const pathname = usePathname();
  const tournament = useV1Tournament(tournamentId);
  const isLeague = tournament.data?.kind === 'regular_league';
  const standingsHref = isLeague
    ? `/league-matches/${encodeURIComponent(tournamentId)}`
    : `/tournaments/${encodeURIComponent(tournamentId)}/results`;
  const next = tournament.data ? findNextFixture(tournament.data, fixtureId) : null;
  const base = resolveTournamentLiveBase(pathname, tournamentId);

  return (
    <>
      <Link href={standingsHref} className="tm-btn tm-btn-sm tm-btn-outline whitespace-nowrap">
        {isLeague ? '순위표 보기' : '대회 결과 보기'}
      </Link>
      {next ? (
        <Link
          href={`${base}/fixtures/${encodeURIComponent(next.fixtureId)}/operate`}
          className="tm-btn tm-btn-sm tm-btn-neutral max-w-full min-w-0"
        >
          <span className="truncate">다음 경기 · {next.label}</span>
        </Link>
      ) : null}
    </>
  );
}
