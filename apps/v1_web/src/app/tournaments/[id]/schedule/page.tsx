import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

// ⚠️ **이 lazy-load 는 가설이었고, 재측정으로 반증됐다 — 원인은 아직 미확정이다.**
//
// 없는 대회에서 이 라우트만 HTTP 200 을 반환하는 결함이 있고, 지금까지 다섯 가설이 전부 실패했다:
//   #298 notFound 게이트 정렬 · #302 generateMetadata 정렬 · #305 metadata 에서 throw ·
//   #307 force-dynamic · 그리고 아래 `next/dynamic` lazy-load(#312 계열).
//
// 이 lazy-load 는 *"SchedulePageClient 의 import 그래프가 서버 번들에 들어와 200 으로 커밋시킨다"* 는
// 가설로 넣은 것이고, 원 주석은 그것을 **"실제 원인"** 이라고 적었다. **2026-09-01 alpha 재측정에서
// 반증됐다:**
//   없는 id  /schedule 200  ·  형제 /bracket 404  ·  /results 404      ← 여전히 이 라우트만 200
//
// **그러니 이 주석을 근거로 "원인은 밝혀졌다" 고 읽지 마라.** lazy-load 자체는 해가 없어 남겨 두지만
// (SSR 은 유지된다) 결함을 고치지는 못한다. 다음 가설을 세울 때 위 다섯 개를 다시 시도하지 마라.
const SchedulePageClient = dynamic(() =>
  import('./schedule-page-client').then((mod) => mod.SchedulePageClient),
);
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) return buildNoIndexMetadata('대회 일정을 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${tournament.title} 경기 일정`,
    description: `${tournament.title}의 경기 일정과 조별 순위를 확인하세요.`,
    path: `/tournaments/${id}/schedule`,
  });
}

export default async function TournamentSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 대회 존재 여부로 게이트한다 — 형제 라우트(bracket/results/reviews/detail)와 동일 패턴.
  // 실제 일정 데이터는 존재하는 대회에 대해 SchedulePageClient 가 클라이언트에서 가져온다.
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) notFound();


  // **정규 리그도 이 화면을 쓴다.** 한동안 여기서 `notFound()` 로 막았는데, 그건 결함을
  // 가린 것이었다 — 리그가 `/tournaments/:id` 통합 축을 통과하는데 클라이언트가 부르는
  // `/tournaments/:id/schedule` 만 404 라 화면이 "경기 정보를 찾을 수 없어요" 로 끝났다.
  // 그 API 가 리그를 응답하도록 고쳐졌으므로(`public-tournament-records.service.ts` 의
  // `leagueSchedule`) 막을 이유가 사라졌다.
  //
  // `isLeague` 는 단계 이름(칩·aria-label)과 선수 기록 섹션 노출만 가른다.
  // ⚠️ `kind` 로만 판정한다 — `isLeagueCompetition` 은 `format === 'league'` 인 **리그 방식
  // 대회**도 true 라(alpha 62건 중 7건) 그 대회들의 어휘까지 바꿔 버린다.
  return <SchedulePageClient tournamentId={id} isLeague={tournament.kind === 'regular_league'} />;
}
