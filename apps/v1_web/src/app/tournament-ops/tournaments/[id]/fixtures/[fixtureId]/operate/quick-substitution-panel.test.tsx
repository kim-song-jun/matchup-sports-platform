import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickSubstitutionPanel } from './quick-substitution-panel';
import type { GameLineup, GameSide } from '@/types/game-operations';

/**
 * 풋살 등 rolling 종목 전용 빠른 교체 모드 — 오조작 방지가 이 컴포넌트의
 * 핵심 계약이다: "나갈 선수 지정"과 "들어올 선수 탭"이 분리된 두 조작이어야
 * 하고, 아무것도 지정되지 않은 상태에서 후보를 눌러도 이벤트가 나가면 안
 * 되며, 확정되면 지정이 자동 해제돼야 한다(다음 실수 탭이 또 교체를 만들지
 * 않도록).
 */

const HOME: GameSide = { id: 's-home', gameId: 'g-1', sideKey: 'HOME', teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' };
const AWAY: GameSide = { id: 's-away', gameId: 'g-1', sideKey: 'AWAY', teamId: null, displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '' };

function participant(id: string, sideId: string, name: string) {
  return {
    id,
    gameId: 'g-1',
    sideId,
    lineupId: `lineup-${sideId}`,
    displayNameSnapshot: name,
    jerseyNumber: 10,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    createdAt: '',
    updatedAt: '',
  };
}

function lineup(side: GameSide, participants: ReturnType<typeof participant>[]): GameLineup {
  return {
    id: `lineup-${side.id}`,
    gameId: 'g-1',
    sideId: side.id,
    revision: 1,
    state: 'SUBMITTED',
    version: 1,
    submittedAt: '',
    supersedesId: null,
    formation: null,
    createdAt: '',
    updatedAt: '',
    participants,
  };
}

const HOME_ON_PITCH = participant('h-on', HOME.id, '정우진');
const HOME_BENCH = participant('h-bench', HOME.id, '이민호');
const AWAY_ON_PITCH = participant('a-on', AWAY.id, '조현우');
const AWAY_BENCH = participant('a-bench', AWAY.id, '박지성');

const SIDES = [HOME, AWAY];
const LINEUPS = [lineup(HOME, [HOME_ON_PITCH, HOME_BENCH]), lineup(AWAY, [AWAY_ON_PITCH, AWAY_BENCH])];
const ON_PITCH = new Set(['h-on', 'a-on']);

describe('QuickSubstitutionPanel', () => {
  it('아무도 지정하지 않은 상태에서는 피치 위 선수만 탭 가능한 목록으로 보인다 — 벤치는 안 보인다', () => {
    render(
      <QuickSubstitutionPanel sides={SIDES} lineups={LINEUPS} onPitchParticipantIds={ON_PITCH} disabled={false} onSubstitute={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /이민호/ })).toBeNull();
  });

  it('지정 전에 (구조적으로 탭 불가능한) 벤치 선수는 노출되지 않으므로, 지정 없이 아무 탭도 onSubstitute를 부르지 않는다', async () => {
    const onSubstitute = vi.fn();
    render(
      <QuickSubstitutionPanel sides={SIDES} lineups={LINEUPS} onPitchParticipantIds={ON_PITCH} disabled={false} onSubstitute={onSubstitute} />,
    );
    // 지정 전 탭은 "나갈 선수 지정"일 뿐 — 이벤트를 만들지 않는다.
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    expect(onSubstitute).not.toHaveBeenCalled();
  });

  it('나갈 선수를 지정한 뒤 같은 팀 벤치를 탭하면 확정하고, 지정을 자동 해제한다', async () => {
    const onSubstitute = vi.fn();
    render(
      <QuickSubstitutionPanel sides={SIDES} lineups={LINEUPS} onPitchParticipantIds={ON_PITCH} disabled={false} onSubstitute={onSubstitute} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ })); // arm
    expect(screen.getByText(/정우진 나가는 중/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /이민호/ })); // commit
    expect(onSubstitute).toHaveBeenCalledWith({
      sideId: 's-home',
      outParticipant: HOME_ON_PITCH,
      inParticipant: HOME_BENCH,
    });
    // 자동 해제 — 배너가 사라지고 다시 "나갈 선수를 먼저 지정하세요" 상태로 돌아간다.
    expect(screen.queryByText(/정우진 나가는 중/)).toBeNull();
  });

  it('지정 중에는 다른 팀 선수를 탭할 수 없다(구조적으로 렌더되지 않음)', async () => {
    render(
      <QuickSubstitutionPanel sides={SIDES} lineups={LINEUPS} onPitchParticipantIds={ON_PITCH} disabled={false} onSubstitute={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ })); // arm home
    // 원정팀 벤치(박지성)는 탭 가능한 목록에 없다.
    expect(screen.queryByRole('button', { name: /박지성/ })).toBeNull();
    expect(screen.getByText(/다른 팀 지정 중이에요/)).toBeInTheDocument();
  });

  it('지정 취소(X) 버튼을 누르면 지정이 해제되고 다시 피치 위 선수 목록으로 돌아간다', async () => {
    render(
      <QuickSubstitutionPanel sides={SIDES} lineups={LINEUPS} onPitchParticipantIds={ON_PITCH} disabled={false} onSubstitute={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    await userEvent.click(screen.getByRole('button', { name: '교체 지정 취소' }));
    expect(screen.queryByText(/정우진 나가는 중/)).toBeNull();
    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
  });
});
