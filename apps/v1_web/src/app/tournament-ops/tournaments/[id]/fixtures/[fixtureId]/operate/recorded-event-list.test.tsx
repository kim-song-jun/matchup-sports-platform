import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    period: 2,
    clockMs,
    occurredAt: '2026-08-04T00:00:00.000Z',
    receivedAt: '2026-08-04T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
  } as GameEventRecord;
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
});
