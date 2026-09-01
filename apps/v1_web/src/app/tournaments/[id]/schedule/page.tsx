import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

// 없는 대회에서 이 라우트만 HTTP 200 을 반환하던 결함의 실제 원인(2026-08-09 alpha 실측으로 격리):
// page.tsx 코드도(#312, 형제와 코드-동일해도 200), 라우트 경로도(#314, 동일 내용을 schedule-view 로
// 옮겨도 200) 원인이 아니었다 — 유일하게 남은 차이인 **SchedulePageClient 클라이언트 컴포넌트의 import
// 그래프**가 이 서버 컴포넌트 번들에 정적으로 들어오면서, notFound() 응답이 200 으로 커밋되게 만들었다
// (형제 results 의 클라이언트는 그렇지 않다). 그래서 **`next/dynamic` 으로 lazy-load** 해 그 그래프를
// 페이지의 초기 서버 렌더 경로에서 분리한다 — 존재하는 대회에선 그대로 렌더되고(SSR 유지), notFound
// 경로는 그 그래프를 건드리지 않는다. 200→404 실제 해소는 프로덕션 런타임이라 배포 후 alpha 재측정으로 확정.
const SchedulePageClient = dynamic(() =>
  import('./schedule-page-client').then((mod) => mod.SchedulePageClient),
);
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) return buildNoIndexMetadata('대회 일정을 찾을 수 없어요');
  // **정규 리그는 이 페이지에 오면 안 된다** — 아래 게이트가 `notFound()` 를 부르지만,
  // 이 라우트는 그때도 **HTTP 200** 을 반환한다(아래 quirk 주석). 상태코드로 못 막으니
  // **색인만이라도 확실히 막는다.** notFound 경로의 메타데이터 동작에 기대지 않고 직접 준다.
  if (tournament.kind === 'regular_league') return buildNoIndexMetadata('대회 일정을 찾을 수 없어요');
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

  /**
   * **정규 리그는 막는다 — 이 페이지가 리그에서 "색인 가능한 에러 화면"이 됐다.**
   *
   * `/tournaments/:id` 가 리그를 허용하도록 넓어지면서(통합 축) 리그가 이 게이트를 통과하는데,
   * 클라이언트가 부르는 `/tournaments/:id/schedule` 은 **리그에서 404** 다. 그래서:
   * ```
   * 리그   HTTP 200 · "경기 정보를 찾을 수 없어요" · noindex 없음   ← 색인 가능한 에러 페이지
   * 대회   HTTP 200 · 일정·조별 순위 정상                          ← 대조군
   * ```
   * (2026-09-01 alpha 실측, 배포 창 밖. 대회 대조군이 정상이라 배포 탓이 아니다.)
   *
   * ## `isLeagueCompetition` 을 쓰지 않는다
   * 그 헬퍼는 `format === 'league'` 인 **리그 방식 대회**도 true 로 준다 — 그건 진짜 대회고
   * 이 페이지가 정상 동작한다(실측: 제목에 "리그 4팀" 이 든 대회가 984자로 정상 렌더). 여기서
   * 묻는 것은 *"무엇인가"* 이므로 `kind` 만 본다.
   *
   * ## 상태코드는 못 고친다 — 색인만 막는다
   * 이 라우트는 `notFound()` 를 불러도 **200** 을 반환한다(아래 quirk). 2026-09-01 재측정에서도
   * 없는 id 로 `/schedule` 200 · 형제 `/bracket`·`/results` 404 로 **여전히 살아 있다** — 위
   * 주석의 `next/dynamic` lazy-load 시도가 해소하지 못했다는 뜻이다. 그래도 not-found UI 와
   * noindex 는 걸리므로 **색인 위험은 닫힌다**, 그게 이 수정의 목표다.
   */
  if (tournament.kind === 'regular_league') notFound();

  return <SchedulePageClient tournamentId={id} />;
}
