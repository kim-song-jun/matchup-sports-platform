import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SchedulePageClient } from './schedule-page-client';
import { buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // 없는 대회는 **generateMetadata 단계에서** notFound() 를 던진다 — 이게 이 라우트의 실제 fix 다.
  // #298(페이지 게이트 정렬)·#302(generateMetadata 를 형제와 같은 엔드포인트로) 둘 다 alpha 배포 후에도
  // schedule 만 없는 대회에서 HTTP 200 을 반환했다(2026-08-09 실측: not-found UI 는 정상 렌더 + robots
  // noindex 까지 걸리는데 상태코드만 200). 원인은 엔드포인트가 아니라 **Next.js 스트리밍 status-commit
  // 타이밍**이었다: 페이지 컴포넌트에서만 notFound() 를 부르면(형제 패턴) 이 라우트는 loading.tsx
  // Suspense 경계 밖 셸이 200 으로 먼저 flush 된 뒤 notFound 가 도달해, not-found UI 는 렌더되지만
  // 상태가 200 에 박힌다(형제는 타이밍상 우연히 flush 전에 notFound 가 도달해 404). generateMetadata 는
  // 스트리밍 셸보다 먼저 await 되므로 여기서 던지면 타이밍과 무관하게 404 가 확정된다. not-found.tsx 가
  // 자체 noindex 메타('대회 일정을 찾을 수 없어요')를 가지므로 여기서 noindex 메타를 따로 낼 필요가 없다.
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) notFound();
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
  // 예전엔 하위 엔드포인트 `/tournaments/:id/schedule` 로 게이트했는데, 그 비대칭 탓에 없는
  // 대회에서도 이 라우트만 HTTP 200 을 반환했다(형제 4개는 정확히 404. 2026-08-09 alpha 실측).
  // 대회가 존재하면 일정이 비어 있어도 페이지는 존재해야 하므로 의미상으로도 이쪽이 맞다 —
  // 실제 일정 데이터는 SchedulePageClient 가 클라이언트에서 가져온다.
  if (!(await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`))) {
    notFound();
  }
  return <SchedulePageClient tournamentId={id} />;
}
