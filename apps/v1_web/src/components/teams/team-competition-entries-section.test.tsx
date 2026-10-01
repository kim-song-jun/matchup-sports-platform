/**
 * 팀 상세 "참가 중인 대회·리그"(Task 180 R-1 B) — 서버 응답을 줄로 바꾸는 규칙과, 누가 [명단 수정]을 보는지.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { v1TeamCompetitionEntriesFixture as fixture } from '@/test/msw/fixtures';
import type { V1TeamCompetitionEntries, V1TeamCompetitionEntry } from '@/types/api';
import { TeamCompetitionEntriesSection, toCompetitionEntryRows } from './team-competition-entries-section';

const SELF = '/teams/team-1';
const FROM = `?from=${encodeURIComponent(SELF)}`;
const NOW = Date.parse('2026-10-01T00:00:00.000Z');

function entries(items: Partial<V1TeamCompetitionEntry>[], viewerCanManageRoster = true): V1TeamCompetitionEntries {
  return {
    teamId: 'team-1',
    viewerCanManageRoster,
    items: items.map((item, index) => ({ ...fixture.items[0], registrationId: `reg-${index}`, ...item })),
  };
}

function renderSection(data: V1TeamCompetitionEntries, extra: { loading?: boolean; error?: boolean; onRetry?: () => void } = {}) {
  return render(
    <TeamCompetitionEntriesSection
      model={{
        rows: toCompetitionEntryRows(data, SELF, NOW),
        viewerCanManageRoster: data.viewerCanManageRoster,
        loading: extra.loading ?? false,
        error: extra.error ?? false,
        onRetry: extra.onRetry ?? vi.fn(),
      }}
    />,
  );
}

describe('toCompetitionEntryRows', () => {
  it('리그는 리그 상세로, 대회는 대회 상세로 가고 [명단]은 그 신청의 참가 명단 화면으로 바로 간다', () => {
    const [league, cup] = toCompetitionEntryRows(fixture, SELF, NOW);
    expect(league).toMatchObject({ kind: 'LEAGUE', href: `/league-matches/league-1${FROM}`, statusLabel: '참가 확정' });
    expect(league.rosterHref).toBe(`/tournaments/league-1/registrations/registration-league-1/roster${FROM}`);
    expect(cup).toMatchObject({ kind: 'TOURNAMENT', href: `/tournaments/tournament-1${FROM}` });
    expect(cup.rosterHref).toBe(`/tournaments/tournament-1/registrations/registration-1/roster${FROM}`);
  });

  it('명단 한 마디 — 수정 가능 · 마감 전 날짜 · 막힌 이유(명단 화면과 같은 말) · 끝난 대회는 종료', () => {
    const rows = toCompetitionEntryRows(
      entries([
        { rosterDeadlineAt: null },
        { rosterDeadlineAt: '2026-10-08T14:59:00.000Z' },
        { rosterDeadlineAt: '2026-09-26T14:59:00.000Z', rosterEditable: false, rosterBlockedBy: 'deadline' },
        { rosterEditable: false, rosterBlockedBy: 'locked' },
        { status: 'completed', rosterEditable: false, rosterBlockedBy: 'closed' },
      ]),
      SELF,
      NOW,
    );
    expect(rows.map((row) => row.rosterNote)).toEqual(['수정 가능', '10월 8일 (목)까지 수정', '제출 마감', '명단 마감', '종료']);
  });

  it('[명단 수정]은 팀장·매니저이면서 명단을 고칠 수 있을 때만 — 둘 중 하나라도 아니면 [명단 보기]', () => {
    const items = [{ rosterEditable: true }, { rosterEditable: false, rosterBlockedBy: 'deadline' as const }];
    expect(toCompetitionEntryRows(entries(items, true), SELF, NOW).map((row) => row.canEdit)).toEqual([true, false]);
    expect(toCompetitionEntryRows(entries(items, false), SELF, NOW).map((row) => row.canEdit)).toEqual([false, false]);
  });
});

describe('TeamCompetitionEntriesSection', () => {
  it('팀장에게 줄마다 신청 상태·선수 수와 [명단 수정]·[명단 보기]를 보인다', () => {
    renderSection(fixture);
    expect(screen.getByText('참가 중인 대회·리그')).toBeInTheDocument();
    const league = screen.getByRole('link', { name: '가을 정규 리그 참가 명단 수정' });
    expect(league).toHaveTextContent('명단 수정');
    expect(screen.getByRole('link', { name: '성수 풋살컵 참가 명단 보기' })).toHaveTextContent('명단 보기');
    const row = league.closest('li') as HTMLElement;
    expect(within(row).getByText('참가 확정')).toBeInTheDocument();
    expect(within(row).getByText(/선수 10명 · 수정 가능/)).toBeInTheDocument();
  });

  it('팀원에게는 [명단 보기]만 보인다', () => {
    renderSection({ ...fixture, viewerCanManageRoster: false });
    expect(screen.queryByRole('link', { name: /명단 수정/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /명단 보기$/ })).toHaveLength(2);
    expect(screen.getByText('참가 명단은 팀장·매니저가 고쳐요.')).toBeInTheDocument();
  });

  it('신청이 하나도 없으면 섹션을 그리지 않고, 조회 실패는 재시도를 보인다', () => {
    const { container, unmount } = renderSection(entries([]));
    expect(container).toBeEmptyDOMElement();
    unmount();

    const onRetry = vi.fn();
    renderSection(entries([]), { error: true, onRetry });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
