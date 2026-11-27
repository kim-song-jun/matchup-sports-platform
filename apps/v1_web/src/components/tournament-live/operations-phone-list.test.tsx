import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { V1TournamentOperationsBoardItem } from '@/types/api';
import { FieldChips } from './field-chips';
import { OperationsPhoneList } from './operations-phone-list';
import { buildBoardCards, type FieldColumn } from './ops-board-model';

function fx(id: string, scheduledAt: string, over: Partial<V1TournamentOperationsBoardItem> = {}): V1TournamentOperationsBoardItem {
  return {
    fixtureId: id,
    tournamentId: 't-1',
    round: '조별리그',
    fixtureNumber: Number(id),
    legNumber: null,
    groupName: null,
    gameId: `g-${id}`,
    gameState: 'SCHEDULED',
    fieldId: 'f1',
    fieldName: '구장 1',
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

const done = (id: string, at: string) => fx(id, at, { gameState: 'ENDED', revisionId: `r${id}`, currentRevisionState: 'OFFICIAL' });

function cardsOf(items: V1TournamentOperationsBoardItem[]) {
  return buildBoardCards({
    items,
    liveWarnings: new Map(),
    labelFor: (item) => ({ title: `팀 ${item.fixtureId}`, subtitle: '' }),
    staff: [],
    role: 'PLATFORM_OPS',
    now: new Date('2026-12-20T01:15:00Z'),
  });
}

const renderCard = (card: { fixtureId: string; title: string }, showField?: boolean) => (
  <article key={card.fixtureId} aria-label={card.title}>
    {card.title}
    {showField ? ' 구장 표시' : ''}
  </article>
);

describe('OperationsPhoneList', () => {
  const items = [
    done('1', '2026-12-20T00:00:00Z'),
    fx('7', '2026-12-20T00:30:00Z', { gameState: 'ENDED', revisionId: null }),
    fx('2', '2026-12-20T01:00:00Z', { gameState: 'LIVE' }),
    done('3', '2026-12-20T00:10:00Z'),
    fx('8', '2026-12-20T01:30:00Z'),
    fx('9', '2026-12-20T02:00:00Z'),
  ];

  it('끝난 경기는 한 줄로 접고, 결과 확정 대기는 접지 않는다', async () => {
    render(<OperationsPhoneList cards={cardsOf(items)} showField={false} nowTimeLabel="10:15" renderCard={renderCard} />);

    expect(screen.queryByRole('article', { name: '팀 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '팀 3' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: '팀 7' })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '끝난 경기 2' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('article', { name: '팀 1' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '팀 3' })).toBeInTheDocument();
  });

  it('지금 선은 지난 경기와 남은 경기 사이에 놓인다', () => {
    render(<OperationsPhoneList cards={cardsOf(items)} showField={false} nowTimeLabel="10:15" renderCard={renderCard} />);

    const separator = screen.getByRole('separator', { name: '지금 10:15' });
    const order = [...document.querySelectorAll('article, [role="separator"]')].map((el) => el.getAttribute('aria-label'));
    expect(order).toEqual(['팀 7', '팀 2', '지금 10:15', '팀 8', '팀 9']);
    expect(separator).toBeInTheDocument();
  });

  it('지금 선이 필요 없으면(오늘이 아닌 날) 그리지 않는다', () => {
    render(<OperationsPhoneList cards={cardsOf(items)} showField={false} nowTimeLabel={null} renderCard={renderCard} />);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('보일 경기가 없고 끝난 경기만 있으면 기본으로 펼친다', () => {
    render(<OperationsPhoneList cards={cardsOf([done('1', '2026-12-20T00:00:00Z'), done('3', '2026-12-20T00:10:00Z')])} showField={false} nowTimeLabel="10:15" renderCard={renderCard} />);

    expect(screen.getByRole('button', { name: '끝난 경기 2' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('접을 경기가 없으면 끝난 경기 줄이 없다', () => {
    render(<OperationsPhoneList cards={cardsOf([fx('8', '2026-12-20T01:30:00Z')])} showField={false} nowTimeLabel={null} renderCard={renderCard} />);
    expect(screen.queryByRole('button', { name: /끝난 경기/ })).not.toBeInTheDocument();
  });

  it('구장 표시 여부를 카드에 넘긴다', () => {
    render(<OperationsPhoneList cards={cardsOf([fx('8', '2026-12-20T01:30:00Z')])} showField nowTimeLabel={null} renderCard={renderCard} />);
    expect(within(screen.getByRole('article', { name: '팀 8' })).getByText(/구장 표시/)).toBeInTheDocument();
  });
});

const columns: FieldColumn[] = ['1', '2', '3', '4'].map((n) => ({ key: `f${n}`, name: `구장 ${n}`, staffLine: '', expiresLabel: null, count: 1 }));

describe('FieldChips', () => {
  it('single: 전체는 빈 선택이고 구장 칩은 하나만 고른다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FieldChips columns={columns.slice(0, 2)} mode="single" selected={[]} onChange={onChange} ariaLabel="구장 고르기" />);

    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '구장 2' }));
    expect(onChange).toHaveBeenLastCalledWith(['f2']);
  });

  it('single: 고른 칩이 눌린 상태이고 전체를 누르면 선택이 비워진다', async () => {
    const onChange = vi.fn();
    render(<FieldChips columns={columns.slice(0, 2)} mode="single" selected={['f2']} onChange={onChange} ariaLabel="구장 고르기" />);

    expect(screen.getByRole('button', { name: '구장 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(screen.getByRole('button', { name: '전체' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  function MultiHarness() {
    const [selected, setSelected] = useState<string[]>([]);
    return <FieldChips columns={columns} mode="multi" selected={selected} maxSelected={3} onChange={setSelected} ariaLabel="구장 고르기" />;
  }

  it('multi: 세 곳을 고르면 넷째 칩이 잠기고, 하나를 끄면 다시 켤 수 있다', async () => {
    const user = userEvent.setup();
    render(<MultiHarness />);

    expect(screen.queryByRole('button', { name: '전체' })).not.toBeInTheDocument();
    for (const name of ['구장 1', '구장 2', '구장 3']) await user.click(screen.getByRole('button', { name }));

    const fourth = screen.getByRole('button', { name: '구장 4' });
    expect(fourth).toBeDisabled();
    expect(fourth).toHaveAttribute('title', '최대 3곳까지 고를 수 있어요');

    await user.click(screen.getByRole('button', { name: '구장 1' }));
    expect(fourth).toBeEnabled();
    await user.click(fourth);
    expect(fourth).toHaveAttribute('aria-pressed', 'true');
  });
});
