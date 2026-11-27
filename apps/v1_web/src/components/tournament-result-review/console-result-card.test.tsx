import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GameResultRevision, TournamentGameDetail } from '@/hooks/use-tournament-result-review';
import { ConsoleResultCard } from './console-result-card';

const GAME = {
  id: 'game-1',
  sourceType: 'TOURNAMENT_FIXTURE',
  state: 'ENDED',
  version: 7,
  lastSequence: 12,
  competitionConfigVersionId: 'config-1',
  currentOfficialRevisionId: null,
  sides: [
    { id: 'side-home', sideKey: 'HOME', displayNameSnapshot: '잠실 레전드' },
    { id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '마포 FS' },
  ],
  periods: [{ number: 1 }, { number: 2 }],
  actorRole: 'tournament_director',
  isKnockoutFixture: false,
} as unknown as TournamentGameDetail;

function revision(state: GameResultRevision['state']): GameResultRevision {
  return { id: 'revision-1', gameId: 'game-1', revision: 1, state, score: { home: 2, away: 1 } } as unknown as GameResultRevision;
}

function renderCard(overrides: Partial<ComponentProps<typeof ConsoleResultCard>> = {}) {
  const onOfficialize = vi.fn();
  const onResubmit = vi.fn();
  render(
    <ConsoleResultCard
      game={GAME}
      latest={revision('SUBMITTED')}
      readOnly={false}
      missingAssists={0}
      officializeVisible
      officializeGateClosed={false}
      officializing={false}
      errorMessage={null}
      onOfficialize={onOfficialize}
      onResubmit={onResubmit}
      onRetryGate={vi.fn()}
      {...overrides}
    />,
  );
  return { onOfficialize, onResubmit };
}

describe('ConsoleResultCard — 콘솔의 결과 확정 카드', () => {
  it('확정 대기 카드에는 「2 : 1 결과 확정」과 「결과 고치기」 두 버튼이 있고 「고치고 확인」은 없다', () => {
    renderCard();
    const card = screen.getByRole('region', { name: '결과 확정' });
    expect(within(card).getByText('확정 전')).toBeInTheDocument();
    expect(within(card).getAllByRole('button').map((button) => button.textContent)).toEqual(['2 : 1 결과 확정', '결과 고치기']);
    expect(screen.queryByRole('button', { name: '고치고 확인' })).toBeNull();
  });

  it('결과 고치기는 onResubmit, 확정은 onOfficialize 를 부른다', () => {
    const { onOfficialize, onResubmit } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: '결과 고치기' }));
    expect(onResubmit).toHaveBeenCalledTimes(1);
    expect(onOfficialize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '2 : 1 결과 확정' }));
    expect(onOfficialize).toHaveBeenCalledTimes(1);
    expect(onResubmit).toHaveBeenCalledTimes(1);
  });

  it('카드에 「정정」 글자가 없고 「확정하면 순위표와 전적에 반영돼요.」는 있다', () => {
    renderCard({ missingAssists: 2 });
    const card = screen.getByRole('region', { name: '결과 확정' });
    expect(card).not.toHaveTextContent('정정');
    expect(within(card).getByText('확정하면 순위표와 전적에 반영돼요.')).toBeInTheDocument();
    // 확정 뒤에는 고치는 길이 달라진다는 경고는 확정 확인 창 한 곳에만 둔다.
    expect(card).not.toHaveTextContent('그 뒤에는');
  });

  it('officializeVisible=false 면 확정 버튼은 없고 결과 고치기는 남는다', () => {
    renderCard({ officializeVisible: false });
    expect(screen.queryByRole('button', { name: /결과 확정$/ })).toBeNull();
    expect(screen.getByRole('button', { name: '결과 고치기' })).toBeEnabled();
  });

  it('확정하는 중에는 결과 고치기를 잠근다', () => {
    renderCard({ officializing: true });
    expect(screen.getByRole('button', { name: '결과 고치기' })).toBeDisabled();
  });

  it('readOnly 면 두 버튼 없이 제출 안내만', () => {
    renderCard({ readOnly: true });
    expect(screen.getByText('결과가 제출됐어요. 운영자가 확인해요.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region', { name: '결과 확정' })).toBeNull();
  });

  it('OFFICIAL 이면 확정 완료 문구와 confirmedFooter', () => {
    renderCard({ latest: revision('OFFICIAL'), confirmedFooter: <a href="/next">다음 경기로</a> });
    expect(screen.getByText('2 : 1 공식 결과로 확정했어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다음 경기로' })).toHaveAttribute('href', '/next');
    expect(screen.queryByRole('button', { name: '결과 고치기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /결과 확정$/ })).toBeNull();
  });
});
