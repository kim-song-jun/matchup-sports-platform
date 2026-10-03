import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAdminDateTime } from '@/lib/date-utils';
import type { TournamentVideoFixture } from '@/hooks/use-v1-fixture-videos';
import LeagueVideosClient from './league-videos-client';

const api = vi.hoisted(() => ({ items: [] as TournamentVideoFixture[], create: vi.fn(), upload: vi.fn(), remove: vi.fn(), navigate: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminLeagueMatch: () => ({ data: { title: '합성 리그' } }) }));
vi.mock('@/hooks/use-v1-fixture-videos', () => ({
  useLeagueFixtureVideos: () => ({ data: { items: api.items }, isPending: false, isError: false }),
  useCreateLeagueFixtureVideoLink: () => ({ mutateAsync: api.create, isPending: false }),
  useUploadLeagueFixtureVideo: () => ({ mutateAsync: api.upload, isPending: false }),
  useDeleteLeagueFixtureVideo: () => ({ mutate: api.remove, isPending: false }),
  VIDEO_UPLOAD_EXTENSION_LABEL: 'mp4, webm, mov', VIDEO_UPLOAD_MAX_LABEL: '200MB',
}));
vi.mock('next/link', () => ({ default: ({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) => (
  <a {...props} href={href} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); api.navigate(href); } }} />
) }));

function fixture(scheduledAt: string | null, index = 0): TournamentVideoFixture {
  return { fixtureId: `synthetic-${index}`, round: `${index + 1}주차`, fixtureNumber: index + 1, legNumber: 1,
    scheduledAt, status: 'scheduled', homeTeamName: index === 0 ? '합성 A팀' : '합성 B팀',
    awayTeamName: index === 0 ? '합성 B팀' : '합성 A팀', videos: [] };
}
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe.each([
  { zone: 'UTC', offset: 0, legacy: '2026.9.17 09:00' },
  { zone: 'America/Los_Angeles', offset: 420, legacy: '2026.9.17 02:00' },
  { zone: 'Asia/Seoul', offset: -540, legacy: '2026.9.17 18:00' },
])('#1574 실제 LeagueVideosClient — $zone', ({ zone, offset, legacy }) => {
  beforeEach(() => { vi.clearAllMocks(); api.items = []; vi.stubEnv('TZ', zone); });

  it('실제 런타임 시간대를 확인하고 기존 local admin formatter를 유지한다', () => {
    expect(new Date('2026-09-17T09:00:00.000Z').getTimezoneOffset()).toBe(offset);
    expect(formatAdminDateTime('2026-09-17T09:00:00.000Z')).toBe(legacy);
  });

  it.each([
    ['2026-09-17T09:00:00.000Z', '2026.9.17 18:00'],
    ['2026-09-24T09:30:00.000Z', '2026.9.24 18:30'],
    ['2026-09-17T15:00:00.000Z', '2026.9.18 00:00'],
    ['2026-12-31T16:30:00.000Z', '2027.1.1 01:30'],
    ['2026-01-01T00:30:00.000Z', '2026.1.1 09:30'],
    ['2026-09-17T18:00:00+09:00', '2026.9.17 18:00'],
  ])('%s를 KST %s로 렌더한다', (value, expected) => {
    api.items = [fixture(value)]; render(<LeagueVideosClient leagueId="synthetic-league" />);
    expect(screen.getByText(`${expected} · 영상 0개`)).toBeInTheDocument();
  });

  it('두 경기·주차·팀·영상0 빈 상태와 실제 상세 링크 계약을 유지한다', async () => {
    api.items = [fixture('2026-09-17T09:00:00.000Z'), fixture('2026-09-24T09:30:00.000Z', 1)];
    render(<LeagueVideosClient leagueId="synthetic-league" />);
    expect(screen.getByText('2026.9.17 18:00 · 영상 0개')).toBeInTheDocument();
    expect(screen.getByText('2026.9.24 18:30 · 영상 0개')).toBeInTheDocument();
    expect(screen.getByText('1주차 · 합성 A팀 vs 합성 B팀')).toBeInTheDocument();
    expect(screen.getByText('2주차 · 합성 B팀 vs 합성 A팀')).toBeInTheDocument();
    expect(screen.getAllByText('아직 등록된 영상이 없어요.')).toHaveLength(2);
    const back = screen.getByRole('link', { name: '리그 상세로' });
    expect(back).toHaveAttribute('href', '/admin/league-matches/synthetic-league');
    await userEvent.setup().click(back); expect(api.navigate).toHaveBeenCalledWith('/admin/league-matches/synthetic-league');
    expect(api.create).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled(); expect(api.remove).not.toHaveBeenCalled();
  });

  it('null 일정은 미정, invalid는 기존 원문을 유지한다', () => {
    api.items = [fixture(null), fixture('not-a-date', 1)]; render(<LeagueVideosClient leagueId="synthetic-league" />);
    expect(screen.getByText('일정 미정 · 영상 0개')).toBeInTheDocument();
    expect(screen.getByText('not-a-date · 영상 0개')).toBeInTheDocument();
  });
});
