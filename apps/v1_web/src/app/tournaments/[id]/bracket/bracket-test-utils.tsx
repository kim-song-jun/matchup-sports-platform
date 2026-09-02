import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, type RenderResult } from '@testing-library/react';
import { BracketPageContent } from './bracket-page-client';
import { publicGameRecordsKeys } from '@/components/public-game-records/use-public-game-records';
import type { PublicTournamentScheduleResponse } from '@/components/public-game-records/types';
import type { V1TournamentDetail } from '@/types/api';

/**
 * 순위·브래킷 화면의 기본 탭은 "경기 일정"이다(오너 지시). 그 탭이
 * react-query(`usePublicTournamentSchedule`)를 쓰므로 이 화면을 렌더하는 테스트는
 * QueryClientProvider 래핑이 필요하다. 네트워크 응답 자체는 이 헬퍼의 관심사가
 * 아니라서 retry를 끈다(실패해도 즉시 에러 상태로 정착).
 */
export function renderBracketPage(
  tournament: V1TournamentDetail,
  /**
   * `/tournaments/:id/schedule` 응답을 캐시에 미리 넣는다.
   *
   * **정규 리그의 순위표가 이 응답에서 온다** — 거울 행에는 대회 축 `groups` 가 없어서
   * 상세만으로는 순위 탭이 영원히 비어 있다(alpha 실측). 이 헬퍼가 네트워크를 안 태우므로,
   * 주입하지 않으면 훅이 실패해 `standings` 가 빈 배열로 떨어진다 — 그 상태로는 리그
   * 순위 렌더를 **검증할 수 없다.**
   */
  schedule?: PublicTournamentScheduleResponse,
): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (schedule) {
    // 무한 쿼리라 페이지 배열 모양으로 넣는다 — 화면이 `data.pages` 를 읽는다.
    queryClient.setQueryData(publicGameRecordsKeys.schedule(tournament.id, {}), {
      pages: [schedule],
      pageParams: [null],
    });
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <BracketPageContent tournament={tournament} />
    </QueryClientProvider>,
  );
}

/**
 * 순위표·대진표를 검증하는 테스트용 — 기본 탭이 "경기 일정"이므로 렌더 직후
 * "순위 · 대진표" 탭을 눌러 그 콘텐츠에 도달한다.
 */
export function renderBracketStandingsTab(
  tournament: V1TournamentDetail,
  schedule?: PublicTournamentScheduleResponse,
): RenderResult {
  const result = renderBracketPage(tournament, schedule);
  // 탭 이름은 종류에 따라 다르다 — 정규 리그엔 대진표가 없어 '리그 순위' 로 부른다
  // (2026-09-01 사용자 확정). 여기서 이름을 하나로 고정하면 리그 픽스처를 쓰는 테스트가
  // 전부 '탭을 못 찾음' 으로 죽는다.
  //
  // ⚠️ 이 헬퍼는 이름 **변경을 흡수**하므로, 탭 이름 자체는 별도 테스트가 단언한다
  // (`bracket-page-client.test.tsx` 의 '탭 이름' 항목) — 여기만 고치고 끝내면 라벨이
  // 바뀌어도 아무도 안 깨진다.
  const standingsTabName = tournament.kind === 'regular_league' ? '리그 순위' : '순위 · 대진표';
  fireEvent.click(result.getByRole('tab', { name: standingsTabName }));
  return result;
}
