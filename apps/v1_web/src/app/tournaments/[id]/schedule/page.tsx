import { permanentRedirect } from 'next/navigation';

/**
 * `/tournaments/:id/schedule` 은 **접혔다.** 같은 일정을 통합 허브 `/bracket` 의
 * "경기 일정" 탭이 같은 `ScheduleContent` 로 그리고, 이 화면에만 있던 선수 기록 섹션도
 * 그쪽으로 함께 옮겼다(`bracket-page-client.tsx`). 두 화면이 같은 내용을 그리는 상태가
 * 이 경로를 **아무 데서도 링크하지 않는 고아**로 만든 원인이었다 — 웹·서버 전수 0건.
 *
 * 딥링크·북마크만 살린다. 쿼리스트링은 그대로 넘기고, 프래그먼트는 서버에 오지 않지만
 * 브라우저가 리다이렉트 대상에 그대로 다시 붙인다.
 *
 * 덤: 이 라우트에는 **없는 대회 id 에 404 대신 200 을 주는 결함**이 있었고 원인을 끝내
 * 찾지 못했다(가설 다섯 개가 전부 반증됐다 — 이전 판 주석 참조). 화면이 사라지면서 그
 * 결함도 함께 사라진다. 우회한 게 아니라 그 화면이 필요 없어진 것이다.
 */
export default async function TournamentSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, item);
    else if (value !== undefined) search.append(key, value);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  permanentRedirect(`/tournaments/${encodeURIComponent(id)}/bracket${suffix}`);
}
