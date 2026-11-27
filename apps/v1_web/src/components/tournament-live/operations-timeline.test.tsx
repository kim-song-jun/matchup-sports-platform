import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { V1TournamentField, V1TournamentOperationsBoardItem, V1TournamentStaffAssignment, V1TournamentStaffRole } from '@/types/api';
import { BoardCardView } from './board-card';
import { OperationsTimeline } from './operations-timeline';
import { buildBoardCards, buildFieldColumns, type BoardCard } from './ops-board-model';

function fx(id: string, fieldId: string | null, scheduledAt: string | null, over: Partial<V1TournamentOperationsBoardItem> = {}): V1TournamentOperationsBoardItem {
  return {
    fixtureId: id,
    tournamentId: 't-1',
    round: '조별리그 1라운드',
    fixtureNumber: Number(id.replace(/\D/g, '')) || 1,
    legNumber: null,
    groupName: 'A조',
    gameId: `g-${id}`,
    gameState: 'SCHEDULED',
    fieldId,
    fieldName: fieldId === null ? null : `구장 ${fieldId.replace('f', '')}`,
    homeRegistrationId: 'r-h',
    awayRegistrationId: 'r-a',
    scheduledAt,
    currentScore: null,
    currentRevisionState: null,
    warnings: [],
    version: 1,
    revisionId: null,
    stableRevision: 'v1',
    ...over,
  };
}

const fields: V1TournamentField[] = [
  { id: 'f1', tournamentId: 't-1', scopeKey: 'f1', name: '구장 1', sortOrder: 1, active: true, version: 1 },
  { id: 'f2', tournamentId: 't-1', scopeKey: 'f2', name: '구장 2', sortOrder: 2, active: true, version: 1 },
];

const operator = (fieldId: string, expiresAt: string | null): V1TournamentStaffAssignment => ({
  id: `s-${fieldId}`, tournamentId: 't-1', userId: `u-${fieldId}`, role: 'FIELD_OPERATOR', fieldId, fixtureIds: [], version: 1,
  expiresAt, revokedAt: null, grantedByUserId: null, createdAt: '2026-12-01T00:00:00.000Z', nickname: '이서연',
});

function cardsFor(items: V1TournamentOperationsBoardItem[], role: V1TournamentStaffRole = 'PLATFORM_OPS', staff: V1TournamentStaffAssignment[] = []) {
  return buildBoardCards({
    items,
    liveWarnings: new Map(),
    labelFor: (item) => ({ title: `팀 ${item.fixtureId}`, subtitle: item.round ?? '' }),
    staff,
    role,
    now: new Date('2026-12-20T01:15:00Z'),
  });
}

function renderTimeline(cards: BoardCard[], opts: { liveBase?: string; consoleQuery?: string; now?: string | null; staff?: V1TournamentStaffAssignment[] } = {}) {
  const liveBase = opts.liveBase ?? '/admin/live/t-1';
  const consoleQuery = opts.consoleQuery ?? '';
  const columns = buildFieldColumns(cards, '2026-12-20', fields, opts.staff ?? []);
  const dayCards = cards.filter((c) => c.dayKey === '2026-12-20');
  return render(
    <OperationsTimeline
      columns={columns}
      cards={dayCards}
      nowTimeLabel={opts.now === undefined ? null : opts.now}
      renderCard={(card) => <BoardCardView key={card.fixtureId} card={card} liveBase={liveBase} consoleQuery={consoleQuery} onOpenInfo={() => {}} />}
    />,
  );
}

describe('OperationsTimeline', () => {
  const items = [
    fx('1', 'f1', '2026-12-20T00:00:00Z', { gameState: 'ENDED', revisionId: 'r1', currentRevisionState: 'OFFICIAL', currentScore: { home: 2, away: 1 } }),
    fx('7', 'f2', '2026-12-20T00:30:00Z', { gameState: 'ENDED', revisionId: null }),
    fx('2', 'f1', '2026-12-20T01:00:00Z', { gameState: 'LIVE' }),
    fx('3', 'f1', '2026-12-20T02:00:00Z'),
    fx('8', 'f2', '2026-12-20T01:30:00Z'),
    fx('9', 'f2', '2026-12-20T01:30:00Z'),
    fx('20', null, '2026-12-20T03:00:00Z'),
  ];

  it('구장별 열 머리와 구장 미정 열을 그리고, 같은 칸의 경기는 쌓는다', () => {
    renderTimeline(cardsFor(items), { staff: [operator('f2', '2026-12-20T05:00:00Z')] });

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual([
      '시간',
      expect.stringContaining('구장 1'),
      expect.stringContaining('구장 2'),
      expect.stringContaining('구장 미정'),
    ]);
    expect(headers[1]).toHaveTextContent('구장 담당자 없음');
    expect(headers[1]).toHaveTextContent('경기 3');
    expect(headers[2]).toHaveTextContent('구장 담당자 이서연');
    expect(headers[2]).toHaveTextContent('14:00까지');

    const stacked = screen.getByRole('row', { name: /10:30/ });
    expect(within(stacked).getAllByRole('article')).toHaveLength(2);
  });

  it('구장 열은 카드 제목이 읽히는 최소 폭을 지키고, 모자라면 판이 가로로 밀린다', () => {
    renderTimeline(cardsFor(items));

    const table = screen.getByRole('table', { name: '구장별 경기 시간표' });
    expect(table).toHaveClass('overflow-x-auto');
    expect(table).toHaveAttribute('tabindex', '0');
    const rows = within(table).getAllByRole('row');
    for (const row of rows) {
      expect(row.style.gridTemplateColumns).toBe('56px repeat(3, minmax(240px, 1fr))');
      expect(row.style.minWidth).toBe('824px');
    }
  });

  it('카드마다 링크는 하나 이하이고 운영 콘솔·더보기 컨트롤이 없다', () => {
    renderTimeline(cardsFor(items));

    for (const article of screen.getAllByRole('article')) {
      expect(within(article).queryAllByRole('link').length).toBeLessThanOrEqual(1);
    }
    expect(screen.queryByRole('link', { name: /운영 콘솔/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /더보기|운영 콘솔/ })).not.toBeInTheDocument();
  });

  it('결과 확정·경기 콘솔 링크가 지금 표면의 주소로 간다', () => {
    const cards = cardsFor(items);
    const { unmount } = renderTimeline(cards);

    expect(within(screen.getByRole('article', { name: /팀 7/ })).getByRole('link')).toHaveAttribute('href', '/admin/live/t-1/results?fixtureId=7');
    expect(within(screen.getByRole('article', { name: /팀 2$/ })).getByRole('link')).toHaveAttribute('href', '/admin/live/t-1/fixtures/2/operate');
    unmount();

    renderTimeline(cards, { liveBase: '/tournament-ops/tournaments/t-1', consoleQuery: '?from=board' });
    expect(within(screen.getByRole('article', { name: /팀 2$/ })).getByRole('link')).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/fixtures/2/operate?from=board');
  });

  it('담당자 없음 카드는 구장 담당자 화면으로 보내는 버튼을 준다', () => {
    const cards = cardsFor([fx('12', 'f2', '2026-12-20T05:30:00Z')], 'PLATFORM_OPS', [operator('f2', '2026-12-20T05:00:00Z')]);
    renderTimeline(cards, { staff: [operator('f2', '2026-12-20T05:00:00Z')] });

    const card = screen.getByRole('article', { name: /팀 12/ });
    expect(card).toHaveTextContent('구장 담당자가 없어요');
    expect(within(card).getByRole('link', { name: /담당자 배정하기/ })).toHaveAttribute('href', '/admin/live/t-1/staff');
  });

  it('상태는 글자 배지로 알리고, 확정됨 카드는 공식 점수를 보여 준다', () => {
    renderTimeline(cardsFor(items));

    expect(within(screen.getByRole('article', { name: /팀 1$/ })).getByText('결과 확정됨')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /팀 1$/ })).toHaveTextContent('2 : 1');
    expect(within(screen.getByRole('article', { name: /팀 7/ })).getByText('결과 확정 대기')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: /팀 2$/ })).getByText('진행 중')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: /팀 3$/ })).getByText('예정')).toBeInTheDocument();
  });

  it('승부차기로 갈린 확정 카드는 정규시간 점수 아래에 승부차기를 함께 보여 준다', () => {
    const penalty = fx('9', 'f1', '2026-12-20T00:00:00Z', {
      gameState: 'ENDED',
      revisionId: 'r9',
      currentRevisionState: 'OFFICIAL',
      currentScore: { home: 0, away: 0, penalties: { home: 2, away: 0 } },
    });
    render(<BoardCardView card={cardsFor([penalty])[0]} liveBase="/admin/live/t-1" consoleQuery="" onOpenInfo={() => {}} />);

    expect(screen.getByRole('article', { name: '팀 9' })).toHaveTextContent('0 : 0');
    expect(screen.getByRole('article', { name: '팀 9' })).toHaveTextContent('승부차기 2:0');
  });

  it('확정 결과가 없으면 점수 줄을 그리지 않는다(0:0 으로 오독되지 않게)', () => {
    render(<BoardCardView card={cardsFor([fx('4', 'f1', '2026-12-20T00:00:00Z', { gameState: 'ENDED', revisionId: null })])[0]} liveBase="/admin/live/t-1" consoleQuery="" onOpenInfo={() => {}} />);
    expect(screen.getByRole('article', { name: '팀 4' })).not.toHaveTextContent(/\d : \d/);
  });

  it('제목 버튼을 누르면 경기 정보를 연다', async () => {
    const onOpenInfo = vi.fn();
    const cards = cardsFor(items);
    render(<BoardCardView card={cards[0]} liveBase="/admin/live/t-1" consoleQuery="" onOpenInfo={onOpenInfo} />);

    await userEvent.setup().click(screen.getByRole('button', { name: '팀 1 경기 정보' }));
    expect(onOpenInfo).toHaveBeenCalledWith(cards[0]);
  });

  it('지금 선은 지난 줄과 남은 줄 사이에 놓인다', () => {
    renderTimeline(cardsFor(items), { now: '10:15' });

    const separator = screen.getByRole('separator', { name: '지금 10:15' });
    const rows = screen.getAllByRole('row');
    const at = rows.findIndex((row) => within(row).queryByRole('separator') !== null);
    expect(rows[at - 1]).toHaveTextContent('10:00');
    expect(rows[at + 1]).toHaveTextContent('10:30');
    expect(separator).toBeInTheDocument();
  });

  it('지금 선이 없으면(오늘이 아닌 날) 그리지 않는다', () => {
    renderTimeline(cardsFor(items), { now: null });
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('한쪽 색 띠 클래스가 어디에도 없다', () => {
    const { container } = renderTimeline(cardsFor(items), { now: '10:15' });
    const offenders = [...container.querySelectorAll('*')].filter((el) => /border-l|border-r-[2-9]|inset|before:/.test(el.getAttribute('class') ?? ''));
    expect(offenders).toHaveLength(0);
  });
});
