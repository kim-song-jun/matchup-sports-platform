import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultEditModal } from './result-edit-modal';
import type {
  GameResultParticipantRecord,
  GameResultScore,
  TournamentGameSide,
} from '@/hooks/use-tournament-result-review';
import type { GameLineup } from '@/types/game-operations';

/**
 * 알파 라이브에서 실제로 관측된 결함: 결과 정정/재제출 모달의 참가자별 기록
 * 입력 폼이 "홈 · 참가자 dc52c8" 처럼 참가자 id 뒷자리만 보여줘서 운영자가
 * 누구의 득점/카드인지 구분할 수 없었다(운영 콘솔은 같은 라인업 데이터로 이미
 * 실명을 정상 표시하고 있었다 -- 이 화면만 그 데이터를 안 받고 있었다).
 *
 * 아래 테스트는 그 계약(라인업이 주어지면 참가자 실명 + 등번호를 렌더)이
 * 되돌려지면 깨진다.
 */

const HOME_SIDE_ID = 'side-home';
const AWAY_SIDE_ID = 'side-away';

const SIDES: TournamentGameSide[] = [
  { id: HOME_SIDE_ID, gameId: 'game-1', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '강남 풋살 클럽' },
  { id: AWAY_SIDE_ID, gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '성수 풋살 클럽' },
];

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

function resultParticipant(participantId: string, sideId: string): GameResultParticipantRecord {
  return {
    id: `result-${participantId}`,
    resultRevisionId: 'revision-1',
    participantId,
    sideId,
    started: true,
    minutesPlayed: null,
    goals: 0,
    assists: 0,
    fouls: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
  };
}

const SCORE: GameResultScore = { home: 1, away: 0 };

// `.slice(-6)`(폴백 라벨이 쓰는 규칙)은 문자열의 "마지막" 6자를 잘라내므로,
// 알파에서 관측된 라벨("참가자 dc52c8")을 재현하려면 그 6자를 id의 접두어가
// 아니라 접미어에 둬야 한다.
const HOME_PARTICIPANT_ID = '11111111-1111-4c3a-9c1e-1111dc52c8';
const AWAY_PARTICIPANT_ID = '22222222-2222-4c3a-9c1e-2222701eb3';

function baseProps() {
  return {
    open: true,
    title: '결과를 정정할까요?',
    message: '메시지',
    confirmLabel: '정정 제출',
    base: {
      score: SCORE,
      participants: [
        resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID),
        resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID),
      ],
      mvpParticipantId: null,
    },
    sides: SIDES,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe('ResultEditModal participant naming', () => {
  it('renders each participant row with their real lineup name and jersey number, not a truncated id', () => {
    const lineups: GameLineup[] = [
      lineup(HOME_SIDE_ID, [{ id: HOME_PARTICIPANT_ID, name: '김골키', jersey: 1 }]),
      lineup(AWAY_SIDE_ID, [{ id: AWAY_PARTICIPANT_ID, name: '강아라', jersey: 7 }]),
    ];

    render(<ResultEditModal {...baseProps()} lineups={lineups} />);

    // 참가자 카드 헤딩과 MVP 드롭다운 옵션 양쪽 모두 같은 라벨을 쓰므로(둘 다
    // `participantLabel`을 호출) 두 곳 모두에서 실명이 나와야 한다.
    expect(screen.getAllByText('홈 · #1 김골키')).toHaveLength(2);
    expect(screen.getAllByText('원정 · #7 강아라')).toHaveLength(2);
    expect(screen.queryByText(/참가자 dc52c8/)).not.toBeInTheDocument();
    expect(screen.queryByText(/참가자 701eb3/)).not.toBeInTheDocument();
  });

  it('falls back to an explicit "라인업에 없음" label (not a blank) when no lineup data is available', () => {
    render(<ResultEditModal {...baseProps()} lineups={[]} />);

    expect(screen.getAllByText('홈 · 참가자 dc52c8 (라인업에 없음)')).toHaveLength(2);
    expect(screen.getAllByText('원정 · 참가자 701eb3 (라인업에 없음)')).toHaveLength(2);
  });
});

/**
 * 알파 실측 결함(#380): `GET /games/:id/result-revisions`가 돌려주는 스코어는
 * 최상위에 `home`/`away`가 없고 `regulation` 안에 중첩된 형태일 수 있다
 * (`{ regulation: {home,away}|null, penalty, goals, incomplete, provenance }`).
 * 이 모달이 그 형태를 평평하게(`.home`/`.away` 직접) 읽으면 폼이 빈 채로 뜨고,
 * 제출 시 서버 `GameScoreDto`가 허용하지 않는 여분 필드(`goals`/`penalty`/
 * `incomplete`/`provenance`/`regulation`)가 함께 나가 `400 VALIDATION_ERROR`가
 * 난다(실제로 프론트가 보낸 payload 그대로면 400, `changes.score`만
 * `{"home":2,"away":1}`로 바꾸면 201).
 */
const REGULATION_SCORE: GameResultScore = {
  regulation: { home: 2, away: 1 },
  penalty: null,
  goals: [],
  incomplete: false,
  provenance: 'TOURNAMENT_FIXTURE_RESULT',
};

describe('ResultEditModal — result-revisions 의 중첩(regulation) 스코어 계약', () => {
  it('base.score 가 중첩 regulation 형태여도 모달 초기값이 undefined 가 아니라 실제 점수로 채워진다', () => {
    const props = baseProps();
    render(
      <ResultEditModal {...props} base={{ ...props.base, score: REGULATION_SCORE }} lineups={[]} />,
    );

    expect(screen.getByLabelText('홈 점수')).toHaveValue(2);
    expect(screen.getByLabelText('원정 점수')).toHaveValue(1);
  });

  it('onConfirm 이 넘기는 score 는 항상 {home, away} 뿐이다 -- goals/penalty/incomplete/provenance/regulation 이 섞이면 서버가 400을 낸다', () => {
    const onConfirm = vi.fn();
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: REGULATION_SCORE }}
        lineups={[]}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText('원정 점수'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '득점 누락 정정' } });
    fireEvent.click(screen.getByRole('button', { name: props.confirmLabel }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const submittedScore = onConfirm.mock.calls[0][0].score;
    expect(submittedScore).toEqual({ home: 2, away: 3 });
    expect(Object.keys(submittedScore).sort()).toEqual(['away', 'home']);
  });
});
