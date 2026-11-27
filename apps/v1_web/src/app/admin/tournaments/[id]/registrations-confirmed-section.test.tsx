import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1ExportRosterCsv, useV1ExportTournamentRosterCsv } from '@/hooks/use-v1-api';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { handlersFixture, registrationFixture as reg, viewContextFixture } from '@/test/registration-fixtures';
import { installViewport } from '@/test/viewport';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { RegistrationsDraftSection, RegistrationsWaitlistCancelledSection } from './registrations-collapsed-sections';
import { RegistrationsConfirmedSection } from './registrations-confirmed-section';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ExportRosterCsv: vi.fn(),
  useV1ExportTournamentRosterCsv: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1' }));
vi.mock('@/components/game-roster/admin-registration-game-rosters', () => ({
  AdminRegistrationGameRosters: (props: { registrationId: string; teamName: string; correctionHref: string }) => (
    <div data-testid="game-rosters-panel" data-registration-id={props.registrationId} data-correction-href={props.correctionHref}>
      {props.teamName}
    </div>
  ),
}));

const exportAllMutate = vi.fn();
let restoreViewport: () => void;

beforeEach(() => {
  restoreViewport = installViewport(1280);
  vi.mocked(useV1ExportRosterCsv).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useV1ExportTournamentRosterCsv).mockReturnValue({ mutate: exportAllMutate, isPending: false } as never);
});

afterEach(() => {
  cleanup();
  restoreViewport();
  __resetOverlayHistoryForTests();
  vi.clearAllMocks();
});

const confirmedTeams = (count: number): V1AdminTournamentRegistration[] =>
  Array.from({ length: count }, (_, i) => reg({ id: `reg-${i + 1}`, teamId: `team-${i + 1}`, teamName: `팀${i + 1}`, playerCount: 7 }));

function renderConfirmed(
  rows: V1AdminTournamentRegistration[],
  props: { teamCapacity?: number; canWrite?: boolean; expandedGameRostersId?: string | null } = {},
) {
  const handlers = handlersFixture();
  render(
    <RegistrationsConfirmedSection
      rows={rows}
      teamCapacity={props.teamCapacity}
      tournamentId="tournament-1"
      ctx={viewContextFixture({ canWrite: props.canWrite ?? true })}
      handlers={handlers}
      expandedGameRostersId={props.expandedGameRostersId ?? null}
      onGameRostersDirtyChange={vi.fn()}
    />,
  );
  return handlers;
}

describe('RegistrationsConfirmedSection — 정원 막대', () => {
  it('정원이 다 차면 그 말과 가득 찬 막대를 보인다', () => {
    renderConfirmed(confirmedTeams(8), { teamCapacity: 8 });
    expect(screen.getByRole('heading', { name: /확정 팀/ })).toHaveTextContent('8 / 8팀');
    expect(screen.getByText('정원이 다 찼어요')).toBeInTheDocument();
    const bar = screen.getByRole('img', { name: '정원 8팀 중 8팀 확정' });
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
  });

  it('정원을 넘겨 확정해도 막대는 100% 에서 멈춘다', () => {
    renderConfirmed(confirmedTeams(9), { teamCapacity: 8 });
    expect(screen.getByText('정원이 다 찼어요')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '정원 8팀 중 9팀 확정' }).firstElementChild).toHaveStyle({ width: '100%' });
  });

  it('자리가 남았으면 비율만큼 채우고 다 찼다고 말하지 않는다', () => {
    renderConfirmed(confirmedTeams(5), { teamCapacity: 8 });
    expect(screen.getByRole('heading', { name: /확정 팀/ })).toHaveTextContent('5 / 8팀');
    expect(screen.queryByText('정원이 다 찼어요')).toBeNull();
    expect(screen.getByRole('img', { name: '정원 8팀 중 5팀 확정' }).firstElementChild).toHaveStyle({ width: '62.5%' });
  });

  it('정원을 모르면(리그) 팀 수만 말하고 막대도 「다 찼어요」도 없다', () => {
    renderConfirmed(confirmedTeams(8), { teamCapacity: undefined });
    expect(screen.getByRole('heading', { name: /확정 팀/ })).toHaveTextContent('8팀');
    expect(screen.getByRole('heading', { name: /확정 팀/ })).not.toHaveTextContent('/');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('정원이 다 찼어요')).toBeNull();
  });

  it('확정된 팀이 없으면 그렇게 말한다', () => {
    renderConfirmed([], { teamCapacity: 8 });
    expect(screen.getByText('아직 확정된 팀이 없어요')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('전체 명단 CSV 는 이 머리에 있고 대회 id 로 한 번 요청한다', () => {
    renderConfirmed(confirmedTeams(2), { teamCapacity: 8 });
    fireEvent.click(screen.getByRole('button', { name: '전체 명단 CSV' }));
    expect(useV1ExportTournamentRosterCsv).toHaveBeenCalledWith('tournament-1');
    expect(exportAllMutate).toHaveBeenCalledTimes(1);
  });
});

describe('RegistrationsConfirmedSection — 팀 줄', () => {
  it('명단 인원과 잠금 상태를 글자로 말하고, 명단 보기와 ⋯ 를 가진다', () => {
    const handlers = renderConfirmed(
      [
        reg({ id: 'a', teamName: '성수', playerCount: 7 }),
        reg({ id: 'b', teamName: '마포', playerCount: 9, rosterLockedAt: '2026-08-01T00:00:00.000Z' }),
      ],
      { teamCapacity: 8 },
    );
    const open = screen.getByText('성수').closest('li') as HTMLElement;
    const locked = screen.getByText('마포').closest('li') as HTMLElement;
    expect(open).toHaveTextContent('명단 7명');
    expect(within(open).getByText('잠금 전')).toBeInTheDocument();
    expect(locked).toHaveTextContent('명단 9명');
    expect(within(locked).getByText('잠김')).toBeInTheDocument();

    fireEvent.click(within(open).getByRole('button', { name: '명단 보기' }));
    expect(handlers.onViewRoster).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(within(open).getByRole('button', { name: '성수 더보기' })).toBeInTheDocument();
  });

  it('⋯ 의 경기별 명단은 그 신청으로 펼침 핸들러를 부른다', () => {
    const handlers = renderConfirmed(confirmedTeams(2), { teamCapacity: 8 });
    fireEvent.click(screen.getByRole('button', { name: '팀2 더보기' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^경기별 명단/ }));
    expect(handlers.onToggleGameRosters).toHaveBeenCalledWith(expect.objectContaining({ id: 'reg-2' }));
  });

  it('조회 전용이면 ⋯ 에 경기별 명단과 명단 CSV 받기만 남는다', () => {
    renderConfirmed(confirmedTeams(1), { canWrite: false });
    fireEvent.click(screen.getByRole('button', { name: '팀1 더보기' }));
    const items = within(screen.getByRole('menu', { name: '팀1' })).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['경기별 명단경기마다 출전 선수를 정해요', '명단 CSV 받기']);
  });

  it('펼친 경기별 명단은 그 팀 줄 안에 하나만 그리고, 그 줄이 한 줄을 다 쓴다', () => {
    renderConfirmed(confirmedTeams(3), { teamCapacity: 8, expandedGameRostersId: 'reg-2' });
    const panels = screen.getAllByTestId('game-rosters-panel');
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAttribute('data-registration-id', 'reg-2');
    expect(panels[0]).toHaveAttribute('data-correction-href', '/admin/live/tournament-1/records/corrections');
    const row = screen.getByText('팀2', { selector: 'span' }).closest('li') as HTMLElement;
    expect(row).toContainElement(panels[0]);
    expect(row.className).toContain('col-span-full');
    expect(screen.getByText('팀1').closest('li')).not.toContainElement(panels[0]);
  });
});

describe('RegistrationsWaitlistCancelledSection', () => {
  const waitlisted = reg({ id: 'w', teamName: '대기팀', status: 'waitlisted' });
  const cancelled = reg({
    id: 'x',
    teamName: '취소팀',
    status: 'cancelled',
    cancelOutcome: 'approved',
    cancelReason: '선수 부족',
    adminCancelReason: '환불 안내함',
  });

  function renderGroup(rows: V1AdminTournamentRegistration[], canWrite = true) {
    const handlers = handlersFixture();
    render(<RegistrationsWaitlistCancelledSection rows={rows} ctx={viewContextFixture({ canWrite })} handlers={handlers} />);
    return handlers;
  }

  it('없으면 한 줄로 말하고 펼치는 버튼도 없다', () => {
    renderGroup([]);
    expect(screen.getByRole('heading', { name: /대기·취소/ })).toHaveTextContent('0');
    expect(screen.getByText('대기하거나 취소된 신청이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('있으면 접혀 있다가 펼치면 팀과 상태를 보이고, 대기 팀은 바로 확정할 수 있다', () => {
    const handlers = renderGroup([waitlisted, cancelled]);
    const toggle = screen.getByRole('button', { name: /대기·취소/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2');
    expect(screen.queryByText('대기팀')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const waitRow = screen.getByText('대기팀').closest('li') as HTMLElement;
    fireEvent.click(within(waitRow).getByRole('button', { name: '확정' }));
    expect(handlers.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'w' }));

    const cancelRow = screen.getByText('취소팀').closest('li') as HTMLElement;
    expect(cancelRow).toHaveTextContent('취소 승인됨');
    expect(screen.getByText('팀 취소 사유: 선수 부족')).toBeInTheDocument();
    expect(screen.getByText('운영진 사유: 환불 안내함')).toBeInTheDocument();
    expect(within(cancelRow).getByRole('button', { name: '명단 보기' })).toBeInTheDocument();
    expect(within(cancelRow).queryByRole('button', { name: '확정' })).toBeNull();
  });

  it('조회 전용이면 대기 팀의 주 버튼도 명단 보기다', () => {
    renderGroup([waitlisted], false);
    fireEvent.click(screen.getByRole('button', { name: /대기·취소/ }));
    const row = screen.getByText('대기팀').closest('li') as HTMLElement;
    expect(within(row).queryByRole('button', { name: '확정' })).toBeNull();
    expect(within(row).getByRole('button', { name: '명단 보기' })).toBeInTheDocument();
  });
});

describe('RegistrationsDraftSection', () => {
  const draft = reg({ id: 'd', teamName: '작성팀', status: 'draft' });

  it('작성 중인 신청이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <RegistrationsDraftSection rows={[]} ctx={viewContextFixture()} handlers={handlersFixture()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('접혀 있다가 펼치면 설명과 임시저장 행이 나오고, 명단 보기와 ⋯ 의 명단 CSV 받기에 닿는다', () => {
    const handlers = handlersFixture();
    const rowMutate = vi.fn();
    vi.mocked(useV1ExportRosterCsv).mockReturnValue({ mutate: rowMutate, isPending: false } as never);
    render(<RegistrationsDraftSection rows={[draft]} ctx={viewContextFixture()} handlers={handlers} />);
    const toggle = screen.getByRole('button', { name: /작성 중/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('작성 중 1');
    expect(screen.queryByText('작성팀')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText('팀이 아직 제출하지 않은 신청이에요')).toBeInTheDocument();
    const row = screen.getByText('작성팀').closest('li') as HTMLElement;
    expect(row).toHaveTextContent('임시저장');
    fireEvent.click(within(row).getByRole('button', { name: '명단 보기' }));
    expect(handlers.onViewRoster).toHaveBeenCalledWith(expect.objectContaining({ id: 'd' }));

    // 전체 명단 CSV 는 임시저장 신청을 빼므로 이 팀별 CSV 가 임시저장 신청 명단을 받는 유일한 길이다.
    fireEvent.click(within(row).getByRole('button', { name: '작성팀 더보기' }));
    const items = within(screen.getByRole('menu', { name: '작성팀' })).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['명단 CSV 받기']);
    fireEvent.click(items[0]);
    expect(useV1ExportRosterCsv).toHaveBeenCalledWith('d');
    expect(rowMutate).toHaveBeenCalledTimes(1);
  });
});
