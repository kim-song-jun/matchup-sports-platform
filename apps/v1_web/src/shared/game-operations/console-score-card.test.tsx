import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import type { GameSide } from '@/types/game-operations';
import { ConsoleScoreCard } from './console-score-card';

function side(id: string, sideKey: 'HOME' | 'AWAY', name: string): GameSide {
  return { id, gameId: 'g-1', sideKey, teamId: null, displayNameSnapshot: name, createdAt: '', updatedAt: '' };
}

const SIDES = [
  side('side-home', 'HOME', 'QA0929 마포 FC'),
  side('side-away', 'AWAY', 'QA0929 합정 유나이티드 아주 긴 팀 이름'),
];

function renderCard(overrides: Partial<ComponentProps<typeof ConsoleScoreCard>> = {}) {
  return render(
    <ConsoleScoreCard
      sides={SIDES}
      scoreBySideId={new Map([['side-home', 2], ['side-away', 1]])}
      foulCounts={{ 'side-home': 2, 'side-away': 3 }}
      foulThreshold={5}
      foulPeriodLabel="전반 팀 파울"
      foulResetNote="후반에는 0부터 다시 세요"
      stateLabel="진행 중"
      clock={<span>전반 12:31</span>}
      penaltyChip={null}
      caption={null}
      footer={null}
      stickyClass="top-[52px] lg:top-0"
      {...overrides}
    />,
  );
}

describe('ConsoleScoreCard', () => {
  it('점수는 한 텍스트 노드 「2 : 1」이고 aria-label 에 팀별 점수가 있다', () => {
    renderCard();
    const score = screen.getByLabelText('스코어 QA0929 마포 FC 2점, QA0929 합정 유나이티드 아주 긴 팀 이름 1점');
    const text = within(score).getByText('2 : 1');
    expect(text.childNodes).toHaveLength(1);
    expect(text.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });

  it('점수와 팀 열은 sides 배열 순서를 그대로 따른다', () => {
    renderCard({ sides: [SIDES[1], SIDES[0]] });
    expect(screen.getByText('1 : 2')).toBeInTheDocument();
    const columns = screen.getAllByRole('group');
    expect(columns[0]).toHaveTextContent('원정');
    expect(columns[1]).toHaveTextContent('홈');
  });

  it('팀 열에 홈·원정 글자와 팀 파울이 있다', () => {
    renderCard();
    const [home, away] = screen.getAllByRole('group');
    expect(within(home).getByText('홈')).toBeInTheDocument();
    expect(within(home).getByText('QA0929 마포 FC')).toBeInTheDocument();
    expect(within(home).getByText('전반 팀 파울 2')).toBeInTheDocument();
    expect(within(away).getByText('원정')).toBeInTheDocument();
    expect(within(away).getByText('전반 팀 파울 3')).toBeInTheDocument();
  });

  it('긴 팀 이름은 자르지 않고 줄바꿈한다', () => {
    renderCard();
    for (const team of SIDES) {
      const name = screen.getByText(team.displayNameSnapshot);
      expect(name).toHaveClass('break-keep');
      expect(name).not.toHaveClass('truncate');
      expect(name).toHaveStyle({ overflowWrap: 'anywhere' });
    }
  });

  it('파울이 기준에 이르면 아이콘+「다음부터 10m 프리킥」, 미만이면 없다', () => {
    renderCard({ foulCounts: { 'side-home': 3, 'side-away': 2 }, foulThreshold: 3 });
    const [home, away] = screen.getAllByRole('group');
    expect(within(home).getByText('다음부터 10m 프리킥')).toBeInTheDocument();
    expect(home.querySelector('svg')).not.toBeNull();
    expect(within(away).queryByText('다음부터 10m 프리킥')).toBeNull();
    expect(away.querySelector('svg')).toBeNull();
  });

  it('단판이면 「경기 팀 파울」', () => {
    renderCard({ foulPeriodLabel: '경기 팀 파울', foulResetNote: null });
    expect(screen.getByText('경기 팀 파울 2')).toBeInTheDocument();
    expect(screen.queryByText(/0부터 다시 세요/)).toBeNull();
  });

  it('다음 경기 시간이 있으면 재시작 안내', () => {
    renderCard();
    expect(screen.getByText('후반에는 0부터 다시 세요')).toBeInTheDocument();
  });

  it('foulPeriodLabel 이 null 이면(경기 중이 아님) 팀 파울을 그리지 않는다', () => {
    renderCard({ foulPeriodLabel: null, foulResetNote: null });
    expect(screen.queryByText(/팀 파울/)).toBeNull();
    expect(screen.queryByText('다음부터 10m 프리킥')).toBeNull();
  });

  it('상태 칩·시계·승부차기 칩·단계 문구·바닥 링크를 한 카드 안에 둔다', () => {
    renderCard({
      penaltyChip: <span>승부차기 4:3</span>,
      caption: <p>하프타임이에요.</p>,
      footer: <a href="/result">결과 보내기</a>,
    });
    const card = screen.getByRole('banner');
    expect(card).toHaveAttribute('data-console-guide', 'overview');
    expect(card).toHaveClass('sticky', 'z-10', 'top-[52px]', 'lg:top-0');
    expect(within(card).getByText('진행 중')).toBeInTheDocument();
    expect(within(card).getByText('전반 12:31')).toBeInTheDocument();
    expect(within(card).getByText('승부차기 4:3')).toBeInTheDocument();
    expect(within(card).getByText('하프타임이에요.')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '결과 보내기' })).toBeInTheDocument();
  });

  it('연결 상태 글자는 카드에 없다', () => {
    renderCard();
    expect(screen.queryByText(/연결/)).toBeNull();
  });

  it('사이드를 아직 못 받았으면 「경기 콘솔」과 상태만 보인다', () => {
    renderCard({ sides: [], scoreBySideId: new Map(), foulPeriodLabel: null, foulResetNote: null, stateLabel: '시작 전', clock: null });
    expect(screen.getByText('경기 콘솔')).toBeInTheDocument();
    expect(screen.getByText('시작 전')).toBeInTheDocument();
    expect(screen.queryByLabelText(/스코어/)).toBeNull();
  });
});
