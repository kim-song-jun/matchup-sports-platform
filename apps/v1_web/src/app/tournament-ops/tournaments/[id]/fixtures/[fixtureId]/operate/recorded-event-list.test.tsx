import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecordedEventList } from './recorded-event-list';
import type { GameEventRecord, GameLineup, GameSide } from '@/types/game-operations';

/**
 * 이 목록이 존재하는 이유는 "기록한 이벤트" 자리에 **서버에 확정된 이벤트 로그**를 보여주기
 * 위해서다. 예전에는 그 자리에 로컬 전송 큐를 그려서, 골이 4개 기록된 경기도 새로고침하면
 * "기록된 이벤트가 아직 없어요" 로 보였다 — 화면이 실제 기록을 부정하는 상태였다.
 * 아래 테스트는 그 계약(서버 이벤트를 시각·득점자·팀과 함께 렌더)이 되돌려지면 깨진다.
 */

const HOME_SIDE_ID = 'side-home';
const AWAY_SIDE_ID = 'side-away';

function side(id: string, name: string): GameSide {
  return {
    id,
    gameId: 'game-1',
    sideKey: id === HOME_SIDE_ID ? 'HOME' : 'AWAY',
    teamId: null,
    displayNameSnapshot: name,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  };
}

function lineup(sideId: string, participants: Array<{ id: string; name: string; jersey: number | null }>): GameLineup {
  return {
    id: `lineup-${sideId}`,
    gameId: 'game-1',
    sideId,
    revision: 1,
    state: 'SUBMITTED',
    version: 1,
    submittedAt: '2026-08-04T00:00:00.000Z',
    supersedesId: null,
    formation: null,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    participants: participants.map((p) => ({
      id: p.id,
      gameId: 'game-1',
      sideId,
      lineupId: `lineup-${sideId}`,
      displayNameSnapshot: p.name,
      jerseyNumber: p.jersey,
      position: null,
      positionX: null,
      positionY: null,
      started: true,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    })),
  };
}

function goal(sequence: number, sideId: string, participantId: string | null, clockMs: number): GameEventRecord {
  return {
    id: `event-${sequence}`,
    gameId: 'game-1',
    sequence,
    clientEventId: `client-${sequence}`,
    payloadHash: 'hash',
    type: 'GOAL',
    sideId,
    participantId,
    assistParticipantId: null,
    period: 2,
    clockMs,
    occurredAt: '2026-08-04T00:00:00.000Z',
    receivedAt: '2026-08-04T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
    payload: {},
  };
}

const SIDES = [side(HOME_SIDE_ID, '강남 풋살 클럽'), side(AWAY_SIDE_ID, '성수 풋살 클럽')];
const LINEUPS = [
  lineup(HOME_SIDE_ID, [{ id: 'p-jung', name: '정우진', jersey: 10 }]),
  lineup(AWAY_SIDE_ID, [{ id: 'p-cho', name: '조현우', jersey: 9 }]),
];

describe('RecordedEventList', () => {
  it('renders each server-confirmed event with its clock, scorer and side', () => {
    render(
      <RecordedEventList
        events={[goal(1, HOME_SIDE_ID, 'p-jung', 6 * 60000), goal(2, AWAY_SIDE_ID, 'p-cho', 11 * 60000)]}
        sides={SIDES}
        lineups={LINEUPS}
      />,
    );

    const rows = within(screen.getByRole('list', { name: '기록된 이벤트 목록' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2P 6');
    expect(rows[0]).toHaveTextContent('골 · 10 정우진');
    expect(rows[0]).toHaveTextContent('강남 풋살 클럽');
    expect(rows[1]).toHaveTextContent('골 · 9 조현우');
    expect(rows[1]).toHaveTextContent('성수 풋살 클럽');
  });

  // 라인업 스냅샷에 없는 참가자를 이름으로 지어내면 운영자가 잘못된 득점자를 보게 된다.
  // 이름을 못 찾으면 팀명만 남기고 조용히 비운다.
  it('does not invent a scorer name when the participant is missing from the lineup snapshot', () => {
    render(
      <RecordedEventList
        events={[goal(1, HOME_SIDE_ID, 'p-unknown', 3 * 60000), goal(2, AWAY_SIDE_ID, null, 5 * 60000)]}
        sides={SIDES}
        lineups={LINEUPS}
      />,
    );

    const rows = within(screen.getByRole('list', { name: '기록된 이벤트 목록' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('강남 풋살 클럽');
    expect(rows[0]).not.toHaveTextContent('정우진');
    expect(rows[0]).not.toHaveTextContent('·');
    expect(rows[1]).toHaveTextContent('성수 풋살 클럽');
    expect(rows[1]).not.toHaveTextContent('조현우');
  });

  it('shows an empty state instead of an empty list when nothing is recorded yet', () => {
    render(<RecordedEventList events={[]} sides={SIDES} lineups={LINEUPS} />);

    expect(screen.queryByRole('list', { name: '기록된 이벤트 목록' })).toBeNull();
    expect(screen.getByText('아직 기록된 이벤트가 없어요.')).toBeInTheDocument();
  });

  it('CARD 이벤트는 payload.card 색으로 옐로/레드를 구분해 렌더한다 — 죽은 스위치 분기 회귀 방지', () => {
    const yellowCard = {
      ...goal(1, HOME_SIDE_ID, 'p-jung', 60000),
      type: 'CARD' as const,
      payload: { card: 'YELLOW' },
    };
    render(<RecordedEventList events={[yellowCard]} sides={SIDES} lineups={LINEUPS} />);
    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toHaveTextContent('옐로카드');
  });

  it('assistParticipantId가 없는 GOAL 이벤트에는 "+ 어시스트" 버튼이 뜬다', () => {
    const onAttachAssist = vi.fn();
    const bareGoal = { ...goal(1, HOME_SIDE_ID, 'p-jung', 60000), assistParticipantId: null };
    render(<RecordedEventList events={[bareGoal]} sides={SIDES} lineups={LINEUPS} onAttachAssist={onAttachAssist} />);
    expect(screen.getByRole('button', { name: /어시스트/ })).toBeInTheDocument();
  });

  it('이미 assistParticipantId가 있는 GOAL 이벤트에는 "+ 어시스트" 버튼이 없다', () => {
    const onAttachAssist = vi.fn();
    const assistedGoal = { ...goal(1, HOME_SIDE_ID, 'p-jung', 60000), assistParticipantId: 'p-cho' };
    render(<RecordedEventList events={[assistedGoal]} sides={SIDES} lineups={LINEUPS} onAttachAssist={onAttachAssist} />);
    expect(screen.queryByRole('button', { name: /어시스트/ })).toBeNull();
  });

  it('SUBSTITUTION 이벤트는 나가는 선수 → 들어오는 선수를 함께 보여준다', () => {
    const substitution = {
      ...goal(1, HOME_SIDE_ID, 'p-jung', 300000),
      type: 'SUBSTITUTION' as const,
      payload: { outParticipantId: 'p-cho' },
    };
    render(
      <RecordedEventList
        events={[substitution]}
        sides={SIDES}
        lineups={[
          ...LINEUPS,
          // p-cho도 홈팀 벤치였다고 가정 — 이름 조회만 검증하면 되므로 sideId는 표시에 영향 없다.
        ]}
      />,
    );
    const row = screen.getByRole('list', { name: '기록된 이벤트 목록' });
    expect(row).toHaveTextContent('교체');
    expect(row).toHaveTextContent('9 조현우 → 10 정우진');
  });

  it('되돌리지 않은 SUBSTITUTION 이벤트에는 "되돌리기" 버튼이 뜨고, 누르면 콜백을 부른다', async () => {
    const onReverseSubstitution = vi.fn();
    const substitution = {
      ...goal(1, HOME_SIDE_ID, 'p-jung', 300000),
      type: 'SUBSTITUTION' as const,
      payload: { outParticipantId: 'p-cho' },
    };
    render(
      <RecordedEventList
        events={[substitution]}
        sides={SIDES}
        lineups={LINEUPS}
        onReverseSubstitution={onReverseSubstitution}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /되돌리기/ }));
    expect(onReverseSubstitution).toHaveBeenCalledWith(substitution);
  });

  it('이미 되돌려진 SUBSTITUTION 이벤트에는 "되돌리기" 버튼이 없다', () => {
    const onReverseSubstitution = vi.fn();
    const substitution = {
      ...goal(1, HOME_SIDE_ID, 'p-jung', 300000),
      type: 'SUBSTITUTION' as const,
      payload: { outParticipantId: 'p-cho' },
    };
    const correction = {
      ...goal(2, HOME_SIDE_ID, null, 300000),
      type: 'CORRECTION' as const,
      reversesEventId: 'event-1',
      payload: { reason: '오조작' },
    };
    render(
      <RecordedEventList
        events={[substitution, correction]}
        sides={SIDES}
        lineups={LINEUPS}
        onReverseSubstitution={onReverseSubstitution}
      />,
    );
    expect(screen.queryByRole('button', { name: /되돌리기/ })).toBeNull();
  });
});
