import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShellOverrideForRoute } from '@/components/v1-ui/shell-override';
import { MatchPageClient } from './match-page-client';

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1/matches/fx-1',
  useSearchParams: () => navigation.searchParams,
}));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicMatch: () => ({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() }),
}));

describe('MatchPageClient 뒤로가기', () => {
  it.each([
    ['팀 전적에서 들어오면 그 화면으로', 'from=%2Fteams%2Ft9%2Frecords', { backHref: '/teams/t9/records' }],
    ['출처가 없으면 셸 기본값(대진표)을 그대로', '', {}],
    ['외부 주소는 무시하고 기본값을', 'from=%2F..%2F%2Fevil.example', {}],
  ])('%s 게시한다', (_label, query, expected) => {
    navigation.searchParams = new URLSearchParams(query);
    let published: ReturnType<typeof useShellOverrideForRoute> = {};
    function ShellProbe() {
      published = useShellOverrideForRoute('/tournaments/t1/matches/fx-1');
      return null;
    }
    render(<><ShellProbe /><MatchPageClient tournamentId="t1" fixtureId="fx-1" /></>);
    expect(published).toEqual(expected);
  });
});
