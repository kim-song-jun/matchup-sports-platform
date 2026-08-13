import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, type RenderResult } from '@testing-library/react';
import { BracketPageContent } from './bracket-page-client';
import type { V1TournamentDetail } from '@/types/api';

/**
 * 순위·브래킷 화면의 기본 탭은 "경기 일정"이다(오너 지시). 그 탭이
 * react-query(`usePublicTournamentSchedule`)를 쓰므로 이 화면을 렌더하는 테스트는
 * QueryClientProvider 래핑이 필요하다. 네트워크 응답 자체는 이 헬퍼의 관심사가
 * 아니라서 retry를 끈다(실패해도 즉시 에러 상태로 정착).
 */
export function renderBracketPage(tournament: V1TournamentDetail): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
export function renderBracketStandingsTab(tournament: V1TournamentDetail): RenderResult {
  const result = renderBracketPage(tournament);
  fireEvent.click(result.getByRole('tab', { name: '순위 · 대진표' }));
  return result;
}
