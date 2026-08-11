import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FixturePickerList } from './fixture-picker-list';
import type { TournamentOperationsBoardItem } from '@/hooks/use-tournament-result-review';

/**
 * 이 목록은 운영진이 "어느 경기를 검토·정정할지" 고르는 유일한 진입점이다.
 * 알파 실측: 팀 이름 없이 "group · 1경기 3:1"만 나와서 어느 경기인지 식별할 수 없었다.
 * 보드 API 응답에는 팀 이름이 없으므로, 화면이 별도로 채워 넣은 이름이 실제로
 * 렌더되는지가 이 컴포넌트의 계약이다.
 */
function makeItem(overrides: Partial<TournamentOperationsBoardItem> = {}): TournamentOperationsBoardItem {
  return {
    fixtureId: 'f-1',
    tournamentId: 't-1',
    round: '조별 1라운드',
    fixtureNumber: 1,
    gameId: 'g-1',
    gameState: 'ENDED',
    fieldId: null,
    fieldName: null,
    homeRegistrationId: 'r-home',
    awayRegistrationId: 'r-away',
    scheduledAt: null,
    currentScore: { home: 3, away: 1 },
    warnings: [],
    version: 1,
    revisionId: null,
    stableRevision: 's-1',
    ...overrides,
  } as TournamentOperationsBoardItem;
}

describe('FixturePickerList', () => {
  it('팀 이름이 주어지면 어느 경기인지 이름으로 식별할 수 있다', () => {
    render(
      <FixturePickerList
        items={[makeItem()]}
        teamNamesByFixtureId={new Map([['f-1', { home: '알파 레드 FC', away: '알파 그린 FC' }]])}
        selectedFixtureId={null}
        onSelect={vi.fn()}
        emptyTitle="없어요"
        emptySub="없어요"
      />,
    );

    expect(screen.getByText('알파 레드 FC vs 알파 그린 FC')).toBeInTheDocument();
    // 라운드·경기 번호는 보조 정보로 남는다.
    expect(screen.getByText('조별 1라운드 · 1경기')).toBeInTheDocument();
    expect(screen.getByText('3:1')).toBeInTheDocument();
  });

  it('팀 이름을 아직 못 받았어도 경기 번호로 목록을 쓸 수 있다', () => {
    render(
      <FixturePickerList
        items={[makeItem()]}
        selectedFixtureId={null}
        onSelect={vi.fn()}
        emptyTitle="없어요"
        emptySub="없어요"
      />,
    );

    expect(screen.getByText('1경기')).toBeInTheDocument();
  });

  it('MISSING_SCORER 를 운영 보드와 같은 뜻(득점자 미기재)으로 표시한다', () => {
    // 예전에는 운영 보드가 '기록자 없음'이라 불러서, 운영자가 존재하지 않는
    // '기록자' 역할을 배정하려 헤매고 정작 득점자 누락은 방치됐다.
    render(
      <FixturePickerList
        items={[makeItem({ warnings: ['MISSING_SCORER'] as TournamentOperationsBoardItem['warnings'] })]}
        selectedFixtureId={null}
        onSelect={vi.fn()}
        emptyTitle="없어요"
        emptySub="없어요"
      />,
    );

    expect(screen.getByText('득점자 미기재')).toBeInTheDocument();
    expect(screen.queryByText('기록자 없음')).not.toBeInTheDocument();
  });
});
