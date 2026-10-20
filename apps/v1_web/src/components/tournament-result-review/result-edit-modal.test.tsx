import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readGameResultScore } from '@/lib/game-result-score';
import { ResultEditModal } from './result-edit-modal';
import type {
  GameResultGoalEventInput,
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
    invalidatedAt: null,
    participants: participants.map((p) => ({
      id: p.id,
      gameId: 'game-1',
      sideId,
      lineupId: `lineup-${sideId}`,
      userId: null,
      displayNameSnapshot: p.name,
      jerseyNumber: p.jersey,
      position: null,
      positionX: null,
      positionY: null,
      started: true,
      arrivedAt: null,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    })),
  };
}

function resultParticipant(
  participantId: string,
  sideId: string,
  overrides?: Partial<GameResultParticipantRecord>,
): GameResultParticipantRecord {
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
    ...overrides,
  };
}

const SCORE: GameResultScore = { home: 1, away: 0 };

/** 서버는 점수 = 팀별 득점 기록 수가 아니면 정정을 422 로 거부하므로, 픽스처는 점수와 같은 수의 익명 득점을 가진다. */
function goalsMatching(score: GameResultScore): GameResultGoalEventInput[] {
  const read = readGameResultScore(score);
  const make = (sideId: string, count: number, prefix: string): GameResultGoalEventInput[] =>
    Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, sideId, anonymous: true, ownGoal: false }));
  return [...make(HOME_SIDE_ID, read?.home ?? 0, 'home'), ...make(AWAY_SIDE_ID, read?.away ?? 0, 'away')];
}

let addedGoalSeq = 0;
/** 화면의 「득점 추가」로 득점 기록을 하나 더한다(점수 칸은 기록 수를 따라간다). */
function addGoal(sideId: string) {
  vi.spyOn(Date, 'now').mockReturnValueOnce(++addedGoalSeq);
  fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
  const count = screen.getAllByLabelText(/번째 득점 팀$/).length;
  if (sideId !== HOME_SIDE_ID) {
    fireEvent.change(screen.getByLabelText(`${count}번째 득점 팀`), { target: { value: sideId } });
  }
}

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
      goalEvents: goalsMatching(SCORE),
      participants: [
        resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID),
        resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID),
      ],
      mvpParticipantId: null,
    },
    sides: SIDES,
    periods: [{ number: 1 }, { number: 2 }],
    // 조별(비결선) 픽스처가 기본값 -- 결선을 다루는 테스트만 `isKnockoutFixture` 를 켠다.
    isKnockoutFixture: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
}

/** 득점 기록 행이 없는 화면 -- 득점 선택칸의 선수 옵션이 선수 이름 개수 검증에 섞이지 않게 한다. */
function propsWithoutGoalRecords() {
  const props = baseProps();
  return { ...props, base: { ...props.base, goalEvents: [] } };
}

type BaseOverrides = Partial<ReturnType<typeof baseProps>['base']>;

/** 모달을 열고 주어진 상호작용을 수행한 뒤 `onConfirm` 목을 돌려준다. */
function submitEdit(
  baseOverrides: BaseOverrides,
  interact: (props: { confirmLabel: string }) => void,
  extraProps: { isKnockoutFixture?: boolean } = {},
) {
  const onConfirm = vi.fn();
  const props = baseProps();
  render(
    <ResultEditModal
      {...props}
      {...extraProps}
      base={{
        ...props.base,
        goalEvents: goalsMatching(baseOverrides.score ?? props.base.score),
        ...baseOverrides,
      }}
      lineups={[]}
      onConfirm={onConfirm}
    />,
  );
  interact({ confirmLabel: props.confirmLabel });
  return { onConfirm };
}

/** 항상 DOM 에 있는 라이브 영역(`role="status"`)의 현재 문구. 빈 문자열이면 경고 없음. */
function liveRegionText(): string {
  return screen.getByRole('status').textContent ?? '';
}

/** 서버 `GameScoreDto` 의 whitelist -- 정확히 이 3키만 받는다
 * (`apps/v1_api/src/games/dto/game-result.dto.ts` 의 `home`/`away`/`penalties?`). */
const ALLOWED_SCORE_KEYS = ['home', 'away', 'penalties'];
/** `whitelist + forbidNonWhitelisted` 아래서 400 을 일으키는 스냅샷 전용 필드들. */
const FORBIDDEN_SCORE_KEYS = ['goals', 'penalty', 'regulation', 'incomplete', 'provenance'];

function expectNoForbiddenScoreKeys(submittedScore: Record<string, unknown>) {
  for (const key of FORBIDDEN_SCORE_KEYS) expect(submittedScore).not.toHaveProperty(key);
  expect(Object.keys(submittedScore).filter((key) => !ALLOWED_SCORE_KEYS.includes(key))).toHaveLength(0);
}

/** placeholder 나 암시적 래핑이 아니라 `<label htmlFor>` + `<input id>` 로 연결됐는지 확인한다. */
function expectLabelledByHtmlFor(input: HTMLElement, labelText: string) {
  expect(input.id).toBeTruthy();
  const label = document.querySelector(`label[for="${input.id}"]`);
  expect(label).not.toBeNull();
  expect(label).toHaveTextContent(labelText);
}

describe('ResultEditModal — 출전자 빼기·추가(어드민이 누가 뛰었는지 고친다)', () => {
  const THIRD_ID = '33333333-3333-4c3a-9c1e-3333aa11bb';
  const lineups: GameLineup[] = [
    lineup(HOME_SIDE_ID, [
      { id: HOME_PARTICIPANT_ID, name: '김골키', jersey: 1 },
      { id: THIRD_ID, name: '박지각', jersey: 9 },
    ]),
    lineup(AWAY_SIDE_ID, [{ id: AWAY_PARTICIPANT_ID, name: '강아라', jersey: 7 }]),
  ];

  function renderModal(onConfirm = vi.fn(), participants = [
    resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID),
    resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID),
  ]) {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 0, away: 0 }, goalEvents: [], participants }}
        lineups={lineups}
        onConfirm={onConfirm}
      />,
    );
    return onConfirm;
  }

  it('명단에 있던 선수를 추가하고 안 뛴 선수를 빼면 그대로 제출한다', () => {
    const onConfirm = renderModal();

    fireEvent.change(screen.getByLabelText('출전 선수 추가'), { target: { value: THIRD_ID } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    fireEvent.click(screen.getByRole('button', { name: '원정 · #7 강아라 출전 기록에서 빼기' }));
    expect(screen.getByText('출전 추가: 1명 · 출전 제외: 1명')).toBeInTheDocument();
    // 추가한 사람은 후보에서 빠지고, 뺀 사람은 다시 추가할 수 있게 후보로 돌아온다.
    const options = within(screen.getByLabelText('출전 선수 추가')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['선수 선택', '원정 · #7 강아라']);

    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '출전 명단 정정' } });
    fireEvent.click(screen.getByRole('button', { name: '정정 제출' }));
    const submitted = onConfirm.mock.calls[0][0].actualParticipants as Array<{ participantId: string; goals: number; started: boolean }>;
    expect(submitted.map((participant) => participant.participantId)).toEqual([HOME_PARTICIPANT_ID, THIRD_ID]);
    expect(submitted[1]).toMatchObject({ goals: 0, started: true, cards: { yellow: 0, red: 0 } });
  });

  it('기록이 있는 선수는 뺄 수 없고 이유를 적는다', () => {
    renderModal(vi.fn(), [
      resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { assists: 1 }),
      resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID),
    ]);
    expect(screen.getByRole('button', { name: '홈 · #1 김골키 출전 기록에서 빼기' })).toBeDisabled();
    expect(screen.getByText('기록이 있는 선수는 기록을 먼저 지운 뒤 뺄 수 있어요.')).toBeInTheDocument();
  });
});

describe('ResultEditModal participant naming', () => {
  // 결과 고치고 확인·결과 정정 창이 모두 이 라벨을 쓴다. 실명은 대회 운영진에게만 내려오고(`identity`),
  // 권한이 없으면 키 자체가 없어 닉네임만 그린다.
  it.each([
    ['운영진(실명 있음)', { realName: '김실명', phone: null }, '홈 · #1 김실명 (김골키)'],
    ['권한 없음(identity 키 없음)', undefined, '홈 · #1 김골키'],
  ])('%s — 참가자 행·MVP 옵션이 같은 이름 규칙을 따른다', (_, identity, label) => {
    const [home, away] = [
      lineup(HOME_SIDE_ID, [{ id: HOME_PARTICIPANT_ID, name: '김골키', jersey: 1 }]),
      lineup(AWAY_SIDE_ID, [{ id: AWAY_PARTICIPANT_ID, name: '강아라', jersey: 7 }]),
    ];
    const lineups: GameLineup[] = [
      { ...home, participants: home.participants.map((p) => (identity === undefined ? p : { ...p, identity })) },
      away,
    ];

    render(<ResultEditModal {...propsWithoutGoalRecords()} lineups={lineups} />);

    expect(screen.getByRole('group', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${label} 출전 기록에서 빼기` })).toBeInTheDocument();
  });

  it('renders each participant row with their real lineup name and jersey number, not a truncated id', () => {
    const lineups: GameLineup[] = [
      lineup(HOME_SIDE_ID, [{ id: HOME_PARTICIPANT_ID, name: '김골키', jersey: 1 }]),
      lineup(AWAY_SIDE_ID, [{ id: AWAY_PARTICIPANT_ID, name: '강아라', jersey: 7 }]),
    ];

    render(<ResultEditModal {...propsWithoutGoalRecords()} lineups={lineups} />);

    // 참가자 카드 헤딩과 MVP 드롭다운 옵션 양쪽 모두 같은 라벨을 쓰므로(둘 다
    // `participantLabel`을 호출) 두 곳 모두에서 실명이 나와야 한다.
    expect(screen.getAllByText('홈 · #1 김골키')).toHaveLength(2);
    expect(screen.getAllByText('원정 · #7 강아라')).toHaveLength(2);
    expect(screen.queryByText(/참가자 dc52c8/)).not.toBeInTheDocument();
    expect(screen.queryByText(/참가자 701eb3/)).not.toBeInTheDocument();
  });

  it('선수별 칸 여섯 개를 선수 이름의 그룹으로 묶고, 각 칸은 숫자 키패드·16px 로 뜬다', () => {
    const lineups: GameLineup[] = [
      lineup(HOME_SIDE_ID, [{ id: HOME_PARTICIPANT_ID, name: '김골키', jersey: 1 }]),
      lineup(AWAY_SIDE_ID, [{ id: AWAY_PARTICIPANT_ID, name: '강아라', jersey: 7 }]),
    ];
    render(<ResultEditModal {...propsWithoutGoalRecords()} lineups={lineups} />);

    // 칸 이름이 "득점" 뿐이라 선수 12명이면 어느 선수 칸인지 알 수 없었다 — 그룹 이름이 선수다.
    const group = screen.getByRole('group', { name: '홈 · #1 김골키' });
    for (const label of ['득점', '어시스트', '파울', '출전(분)', '경고', '퇴장']) {
      const input = within(group).getByLabelText(label);
      expect(input).toHaveAttribute('inputmode', 'numeric');
      expect(input).toHaveStyle({ fontSize: 'var(--font-size-input)' });
    }
    expect(within(group).getByRole('checkbox', { name: '골키퍼' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '원정 · #7 강아라' })).getAllByRole('spinbutton')).toHaveLength(6);
  });

  it('falls back to an explicit "라인업에 없음" label (not a blank) when no lineup data is available', () => {
    render(<ResultEditModal {...propsWithoutGoalRecords()} lineups={[]} />);

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

  it('onConfirm 이 넘기는 score 에는 goals/penalty/incomplete/provenance/regulation 이 섞이지 않는다 -- 섞이면 서버가 400을 낸다', () => {
    const { onConfirm } = submitEdit({ score: REGULATION_SCORE }, ({ confirmLabel }) => {
      addGoal(AWAY_SIDE_ID);
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: '득점 누락 정정' } });
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const submittedScore = onConfirm.mock.calls[0][0].score;
    expect(submittedScore).toMatchObject({ home: 2, away: 2 });
    expectNoForbiddenScoreKeys(submittedScore);
  });
});

/**
 * 2-C 프론트 절반: 정정 폼이 승부차기(`penalties`) 점수를 탈락시킨다 -- 단,
 * **서버가 받아 주는 상태에서만** 이어서 보낸다.
 *
 * `penalties` 는 서버 `GameScoreDto`(`apps/v1_api/src/games/dto/game-result.dto.ts`)
 * 에 실재하는 **허용 필드**다(`home`/`away`/`penalties?` 정확히 3키). 위 describe 가
 * 지키는 계약("여분 필드는 제거")과 충돌하지 않는다 -- 제거해야 하는 건
 * `goals`/`penalty`/`regulation`/`incomplete`/`provenance` 5종뿐이다.
 *
 * 결선 무승부는 승부차기로만 승자가 갈리므로, 정정 한 번으로 `penalties` 가
 * 사라지면 확정된 결선 경기의 승자 자체가 사라진다. 반대로 **무조건** 실어 보내면
 * 서버 `applyPenalties`(`apps/v1_api/src/games/games.service.ts`)의 두 가드에 걸린다:
 * 결선이 아닌 픽스처 / 정규시간이 무승부가 아닌 경우 둘 다 409
 * `TOURNAMENT_PENALTY_NOT_ALLOWED` 다. 그 가드가 배포되기 전이라면 더 나쁘다 --
 * `{home:1, away:2, penalties:{4,3}}` 같은 모순된 스코어가 저장돼 브래킷 진출자
 * (정규시간 우선, `game-result-bracket-projection.service.ts`)와 공개 화면 승자
 * (`hasPenalty` 우선, `tournaments/[id]/results/results-page-client.tsx`)가 갈린다.
 *
 * 그래서 계약은 "보존"이 아니라 **"서버가 받아 주는 상태에서만 보존"** 이고, 못 보내는
 * 경우에는 값이 사라진다는 사실을 경고로 드러내야 한다(아래 마지막 describe).
 *
 * 중첩 형태의 필드명은 `penalty`(단수)이고 평평한 형태는 `penalties`(복수)인데,
 * `readGameResultScore`(`lib/game-result-score.ts`)가 이미 `penalties` 로 정규화해
 * 돌려준다.
 */
describe('ResultEditModal — 승부차기(penalties) 점수 보존', () => {
  it('결선 무승부 정정에서는 중첩(regulation/penalty) base 의 승부차기 점수가 penalties 로 살아서 나간다', () => {
    const { onConfirm } = submitEdit(
      {
        score: {
          regulation: { home: 0, away: 0 },
          penalty: { home: 2, away: 0 },
          goals: [],
          incomplete: false,
          provenance: 'TOURNAMENT_FIXTURE_RESULT',
        },
      },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '승부차기 결과 유지' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
      { isKnockoutFixture: true },
    );

    const submittedScore = onConfirm.mock.calls[0][0].score;
    expect(submittedScore).toMatchObject({ home: 0, away: 0, penalties: { home: 2, away: 0 } });
    // 중첩 형태의 이름(`penalty`, 단수)이 그대로 새 나가면 서버 whitelist 에 걸려 400 이다.
    expectNoForbiddenScoreKeys(submittedScore);
  });

  it('결선 무승부가 유지되면 정규시간 점수를 고쳐도 평평한 base 의 penalties 가 그대로 실려 나간다', () => {
    const { onConfirm } = submitEdit(
      { score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } },
      ({ confirmLabel }) => {
        // 1:1 -> 2:2 (여전히 무승부) -- 승부차기가 계속 승자를 가리는 상태다.
        addGoal(HOME_SIDE_ID);
        addGoal(AWAY_SIDE_ID);
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '정규시간 득점 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
      { isKnockoutFixture: true },
    );

    const submittedScore = onConfirm.mock.calls[0][0].score;
    expect(submittedScore).toMatchObject({ home: 2, away: 2, penalties: { home: 4, away: 3 } });
    expectNoForbiddenScoreKeys(submittedScore);
  });

  it('정규시간 승패가 갈리면 penalties 를 싣지 않는다 -- 서버가 409 로 거부하고, 그 전이라면 브래킷과 공개 화면의 승자가 갈린다', () => {
    const { onConfirm } = submitEdit(
      { score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } },
      ({ confirmLabel }) => {
        // 1:1(승부차기 4:3) -> 2:1 -- 정규시간에서 이미 승자가 갈렸다.
        addGoal(HOME_SIDE_ID);
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '정규시간 득점 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
      { isKnockoutFixture: true },
    );

    const submittedScore = onConfirm.mock.calls[0][0].score;
    expect(submittedScore).toEqual({ home: 2, away: 1 });
    expect(submittedScore).not.toHaveProperty('penalties');
  });

  it('결선이 아닌 픽스처의 레거시 승부차기 값은 싣지 않는다 -- 서버가 조별 픽스처의 승부차기를 거부한다', () => {
    const { onConfirm } = submitEdit(
      { score: { home: 1, away: 1, penalties: { home: 3, away: 2 } } },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '어시스트만 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
      { isKnockoutFixture: false },
    );

    expect(onConfirm.mock.calls[0][0].score).toEqual({ home: 1, away: 1 });
  });

  it('승자가 갈리지 않는 승부차기(동점)는 제출을 막아 서버 422 값을 박제하지 않는다', () => {
    const { onConfirm } = submitEdit(
      { score: { home: 0, away: 0, penalties: { home: 3, away: 3 } } },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '어시스트만 정정' } });
        expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
      },
      { isKnockoutFixture: true },
    );

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('실어 보내는 penalties 는 느슨한 JSON 의 여분 키를 떨어뜨린 { home, away } 로 다시 만들어진다', () => {
    const { onConfirm } = submitEdit(
      {
        // `V1GameResultRevision.score` 는 느슨한 JSON 컬럼이라 레거시 백필이 남긴 여분
        // 키가 섞여 있을 수 있고, 서버 `GameScoreDto.penalties` 는 `@IsObject()` 하나뿐
        // 이어서 그대로 통과시킨다(= 새 권위 리비전에 박제된다).
        score: { home: 0, away: 0, penalties: { home: 2, away: 1, note: 'legacy' } } as never,
      },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '어시스트만 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
      { isKnockoutFixture: true },
    );

    expect(onConfirm.mock.calls[0][0].score.penalties).toEqual({ home: 2, away: 1 });
  });

  /**
   * 선축(`firstKickSideKey`)도 **여분 키가 아니라 허용 키**다 -- 정정 한 번으로 사라지면
   * 안 된다.
   *
   * `readSubmittablePenalties` 는 통과한 값을 `{home, away}` 로 **다시 만들어서** 돌려준다
   * (바로 위 테스트가 지키는 계약: 레거시 여분 키를 떨어뜨린다). 그 재조립이 선축까지 함께
   * 지우기 때문에, 승부차기로 승자가 갈린 결선 경기를 한 번만 정정해도 "누가 먼저 찼는지"가
   * 영구히 사라진다 -- 폼에는 선축 입력란이 없으므로 되살릴 수단도 없다. 위 `note: 'legacy'`
   * 테스트가 계속 초록인 채로 이 테스트만 빨간 것이, 고쳐야 할 것이 "여분 키 필터 자체"가
   * 아니라 **허용 키 목록**이라는 증거다.
   */
  it('선축(firstKickSideKey)은 여분 키가 아니라 허용 키다 -- 정정에서 살아서 나간다', () => {
    const { onConfirm } = submitEdit(
      {
        score: { home: 1, away: 1, penalties: { home: 5, away: 4, firstKickSideKey: 'AWAY' } },
      },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '어시스트만 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
      { isKnockoutFixture: true },
    );

    const submittedScore = onConfirm.mock.calls[0][0].score;
    expect(submittedScore.penalties).toEqual({ home: 5, away: 4, firstKickSideKey: 'AWAY' });
    // 선축이 허용 키가 돼도 스냅샷 전용 필드는 여전히 떨어져야 한다(서버 whitelist).
    expectNoForbiddenScoreKeys(submittedScore);
  });
});

/**
 * 2-A(핵심): 정정 한 번에 어시스트·파울이 0으로 초기화된다.
 *
 * 서버 `GameResultParticipantDto` 는 `assists?`/`fouls?` 를 받고,
 * `tournament-result-review.service.ts` 는 미전달 시 `?? 0` 으로 채운다 -- 즉 폼이
 * 값을 안 실어 보내면 정정 한 번으로 선수 개개인의 어시스트·파울이 전부 0이 된다.
 * 확정 후 어시스트를 고칠 유일한 통로가 이 정정 경로(직접 수정은 409
 * `RESULT_ALREADY_OFFICIAL`)이므로, 이 경로가 값을 떨어뜨리면 복구 수단이 없다.
 */
describe('ResultEditModal — 참가자 어시스트·파울 보존/입력 (2-A)', () => {
  it('base 의 assists/fouls 를 건드리지 않고 제출하면 원래 값이 그대로 실려 나간다', () => {
    const { onConfirm } = submitEdit(
      {
        score: { home: 2, away: 0 },
        goalEvents: [
          { id: 'goal-1', sideId: HOME_SIDE_ID, participantId: HOME_PARTICIPANT_ID, ownGoal: false },
          { id: 'goal-2', sideId: HOME_SIDE_ID, participantId: HOME_PARTICIPANT_ID, ownGoal: false },
        ],
        participants: [
          resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { goals: 2, assists: 1, fouls: 3 }),
          resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID, { goals: 0, assists: 2, fouls: 1 }),
        ],
      },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '점수만 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    const submitted = onConfirm.mock.calls[0][0].actualParticipants;
    expect(submitted[0]).toMatchObject({ participantId: HOME_PARTICIPANT_ID, goals: 2, assists: 1, fouls: 3 });
    expect(submitted[1]).toMatchObject({ participantId: AWAY_PARTICIPANT_ID, goals: 0, assists: 2, fouls: 1 });
  });

  it('어시스트·파울 입력란이 label htmlFor 로 연결돼 있고, 입력값이 제출 payload 로 왕복한다', () => {
    const { onConfirm } = submitEdit(
      {
        participants: [
          resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { assists: 1, fouls: 0 }),
          resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID),
        ],
      },
      ({ confirmLabel }) => {
        const assistsInput = screen.getAllByLabelText('어시스트')[0];
        const foulsInput = screen.getAllByLabelText('파울')[0];
        expectLabelledByHtmlFor(assistsInput, '어시스트');
        expectLabelledByHtmlFor(foulsInput, '파울');

        fireEvent.change(assistsInput, { target: { value: '3' } });
        fireEvent.change(foulsInput, { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '어시스트·파울 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    expect(onConfirm.mock.calls[0][0].actualParticipants[0]).toMatchObject({ assists: 3, fouls: 2 });
  });

  it('출전 시간(분)을 편집해 결과 participant payload에 반영하고, null 값은 임의로 0으로 만들지 않는다', () => {
    const { onConfirm } = submitEdit(
      {
        participants: [
          resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { minutesPlayed: 12 }),
          resultParticipant(AWAY_PARTICIPANT_ID, AWAY_SIDE_ID, { minutesPlayed: null }),
        ],
      },
      ({ confirmLabel }) => {
        const minutesInputs = screen.getAllByLabelText('출전(분)');
        expect(minutesInputs).toHaveLength(2);
        expect((minutesInputs[0] as HTMLInputElement).value).toBe('12');
        expect((minutesInputs[1] as HTMLInputElement).value).toBe('');
        fireEvent.change(minutesInputs[0], { target: { value: '45' } });
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '출전 시간 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    const submitted = onConfirm.mock.calls[0][0].actualParticipants;
    expect(submitted[0]).toMatchObject({ participantId: HOME_PARTICIPANT_ID, minutesPlayed: 45 });
    expect(submitted[1].minutesPlayed).toBeUndefined();
  });

  it('득점 기록을 지우면 점수와 선수 득점이 함께 줄어 제출된다', () => {
    const { onConfirm } = submitEdit(
      {
        goalEvents: [{ id: 'goal-1', sideId: HOME_SIDE_ID, participantId: HOME_PARTICIPANT_ID, ownGoal: false }],
        participants: [resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { goals: 1 })],
      },
      ({ confirmLabel }) => {
        fireEvent.click(screen.getByRole('button', { name: '삭제' }));
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '오기록 삭제' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    const submitted = onConfirm.mock.calls[0][0];
    expect(submitted.goalEvents).toEqual([]);
    expect(submitted.score).toEqual({ home: 0, away: 0 });
    expect(submitted.actualParticipants[0]).toMatchObject({ goals: 0 });
  });
});

/**
 * diff 표시 계약: "모든 정정은 사유와 변경 내용을 함께 남긴다".
 * 승부차기·어시스트·파울이 diff 에서 빠지면 운영자가 확정 직전에 자기가 무엇을
 * 바꾸는지 확인할 수 없다(`lib/game-result-score.ts` 의 docblock 도 "결과를
 * 보여주는 자리에는 `formatGameResultScoreWithPenalties` 를 쓰라"고 명시한다).
 */
describe('ResultEditModal — 변경 내용(diff) 표시', () => {
  it('점수 diff 는 base 의 승부차기 점수까지 보여준다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } }}
        lineups={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '2' } });

    expect(screen.getByText(/점수 변경: 1:1 \(승부차기 4:3\) → 2:1/)).toBeInTheDocument();
  });

  it('어시스트만 바뀌어도 참가자 기록 변경으로 잡힌다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{
          ...props.base,
          participants: [resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { assists: 1 })],
        }}
        lineups={[]}
      />,
    );

    expect(screen.queryByText(/참가자 기록 변경/)).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText('어시스트')[0], { target: { value: '2' } });

    expect(screen.getByText('참가자 기록 변경: 1명')).toBeInTheDocument();
  });

  it('파울만 바뀌어도 참가자 기록 변경으로 잡힌다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{
          ...props.base,
          participants: [resultParticipant(HOME_PARTICIPANT_ID, HOME_SIDE_ID, { fouls: 0 })],
        }}
        lineups={[]}
      />,
    );

    fireEvent.change(screen.getAllByLabelText('파울')[0], { target: { value: '1' } });

    expect(screen.getByText('참가자 기록 변경: 1명')).toBeInTheDocument();
  });

  // 통과하는 짝: 같은 diff 렌더 경로를 이미 폼에 있는 `득점`으로 확인한다.
  it('득점이 바뀌면 참가자 기록 변경으로 잡힌다 (하네스 정상 동작 증명)', () => {
    const props = baseProps();
    render(<ResultEditModal {...props} lineups={[]} />);

    fireEvent.change(screen.getAllByLabelText('득점')[0], { target: { value: '1' } });

    expect(screen.getByText('참가자 기록 변경: 1명')).toBeInTheDocument();
  });
});

/**
 * 결선(knockout) 무승부 사전 경고.
 *
 * 서버는 결선 경기의 정규시간 무승부를 승부차기 없이 받지 않는다(409
 * `TOURNAMENT_PENALTY_REQUIRED` -- '결선 경기는 무승부로 끝낼 수 없어요.
 * 승부차기 결과를 입력해주세요.'). 지금은 저장 버튼을 눌러야 그 사실을 알게 되므로
 * 폼에서 미리 알려야 한다.
 *
 * 경고는 **경고일 뿐 차단이 아니다** -- 무효화된 결과의 재입력(VOID 재진입)은 다른
 * 계약이라 프론트가 제출 자체를 막으면 안 된다. 그래서 아래 테스트는 경고가 뜨는
 * 동시에 제출이 그대로 진행되는 것까지 함께 단언한다.
 */
describe('ResultEditModal — 결선 무승부 사전 경고', () => {
  it('결선 경기에서 정정 후 정규시간이 무승부면 role="status" 경고가 뜨고, 제출을 막지는 않는다', () => {
    const onConfirm = vi.fn();
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 2, away: 1 }, goalEvents: goalsMatching({ home: 2, away: 1 }) }}
        lineups={[]}
        isKnockoutFixture
        onConfirm={onConfirm}
      />,
    );

    // 라이브 영역은 문구가 생기기 **전에도** DOM 에 있어야 한다(아래 별도 describe 참고).
    expect(liveRegionText()).toBe('');

    addGoal(AWAY_SIDE_ID);

    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent(/승부차기/);
    expect(warning).toHaveAttribute('aria-live', 'polite');
    // 스크린리더 사용자가 점수 입력을 다루는 동안에도 경고를 듣도록 폼이 이 경고를
    // 참조해야 한다(`aria-describedby`).
    const warningId = warning.getAttribute('id');
    expect(warningId).toBeTruthy();
    expect(document.querySelector(`[aria-describedby~="${warningId}"]`)).not.toBeNull();

    // 무승부에는 유효한 승부차기 결과가 필요하다. 점수와 선축 팀을 입력하면 제출된다.
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '무승부로 정정' } });
    const confirmButton = screen.getByRole('button', { name: props.confirmLabel });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('홈 성공'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('원정 성공'), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('원정'));
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].score.penalties).toEqual({
      home: 4,
      away: 3,
      firstKickSideKey: 'AWAY',
    });
  });

  it('결선 경기라도 무승부가 아니고 승부차기 기록도 없으면 경고 문구가 비어 있다', () => {
    const props = baseProps();
    render(
      <ResultEditModal {...props} base={{ ...props.base, score: { home: 2, away: 2 } }} lineups={[]} isKnockoutFixture />,
    );

    fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '3' } });

    expect(liveRegionText()).toBe('');
  });

  it('결선이 아닌 경기(조별)에서는 무승부여도 경고 문구가 비어 있다', () => {
    const props = baseProps();
    render(<ResultEditModal {...props} base={{ ...props.base, score: { home: 2, away: 2 } }} lineups={[]} />);

    expect(liveRegionText()).toBe('');
  });
});

/**
 * 승부차기가 **떨어져 나가는** 경우의 사전 고지. 이 변경이 승부차기를 조건부로만
 * 이어 보내기 시작했으므로, 값이 사라지는 세 상태를 저장 전에 드러내야 한다 --
 * 폼에 승부차기 입력란이 없어서 운영자가 값을 직접 고칠 수단이 없기 때문이다.
 *
 * 안내 문구는 "무효화 후 재입력"을 해결책으로 제시하지 않는다 -- 다음 라운드 픽스처가
 * 이미 `scheduled` 를 벗어났으면 무효화도 409 `NEXT_FIXTURE_CONFLICT` 로 막히므로
 * (`tournament-result-review.service.ts`) 안내대로 해도 두 번 실패한다.
 */
describe('ResultEditModal — 승부차기 탈락 사전 고지', () => {
  it('결선 경기의 정규시간 승패가 갈리면 승부차기가 함께 지워진다고 알린다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } }}
        lineups={[]}
        isKnockoutFixture
      />,
    );

    expect(liveRegionText()).toBe('');

    fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '2' } });

    expect(liveRegionText()).toMatch(/승부차기 결과는 함께 지워져요/);
    expect(liveRegionText()).not.toMatch(/무효화/);
  });

  it('결선이 아닌 픽스처에 승부차기 기록이 남아 있으면 그 값이 저장되지 않는다고 알린다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 1, away: 1, penalties: { home: 3, away: 2 } } }}
        lineups={[]}
      />,
    );

    expect(liveRegionText()).toMatch(/결선이 아니라 승부차기를 기록할 수 없어요/);
  });

  it('결선 무승부인데 기존 승부차기 기록이 못 쓰는 값이면(동점) 다시 기록해야 한다고 알린다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 0, away: 0, penalties: { home: 3, away: 3 } } }}
        lineups={[]}
        isKnockoutFixture
      />,
    );

    expect(liveRegionText()).toMatch(/승부차기 결과를 다시 기록해야 해요/);
  });

  it('승부차기가 떨어져 나가면 정규시간 점수를 안 고쳐도 점수 diff 가 그 사실을 보여준다', () => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        base={{ ...props.base, score: { home: 1, away: 1, penalties: { home: 3, away: 2 } } }}
        lineups={[]}
      />,
    );

    expect(screen.getByText('점수 변경: 1:1 (승부차기 3:2) → 1:1')).toBeInTheDocument();
  });
});

/**
 * 서버 숫자 필드는 전부 `@IsInt() @Min(0)` 이다(`GameScoreDto`,
 * `GameResultParticipantDto`). 소수를 그대로 보내면 `400 VALIDATION_ERROR` 가 나고 그
 * 코드는 `KNOWN_ERROR_MESSAGES` 에 없어 검증 원문이 그대로 모달에 노출된다.
 */
describe('ResultEditModal — 숫자 입력은 정수로 정규화된다', () => {
  it('참가자 기록 칸에 소수를 넣으면 정수로 잘려서 제출된다', () => {
    const { onConfirm } = submitEdit({}, ({ confirmLabel }) => {
      fireEvent.change(screen.getAllByLabelText('어시스트')[0], { target: { value: '1.5' } });
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: '어시스트 정정' } });
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
    });

    expect(onConfirm.mock.calls[0][0].actualParticipants[0]).toMatchObject({ assists: 1 });
  });

  it('점수 칸에 소수를 넣어도 정수로 잘려서 반영된다', () => {
    submitEdit({}, () => {
      fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '2.7' } });
    });

    expect(screen.getByLabelText('홈 점수')).toHaveValue(2);
  });
});

describe('ResultEditModal — 단판 경기의 득점 피리어드', () => {
  const renderWith = (periodCount: number | null | undefined, onConfirm = vi.fn()) => {
    const props = baseProps();
    render(
      <ResultEditModal
        {...props}
        periods={periodCount === 1 ? [{ number: 1 }] : props.periods}
        periodCount={periodCount}
        base={{ ...props.base, goalEvents: [{ id: 'goal-1', sideId: HOME_SIDE_ID, participantId: HOME_PARTICIPANT_ID, minute: 1, period: 1, ownGoal: false }] }}
        lineups={[]}
        onConfirm={onConfirm}
      />,
    );
    return { onConfirm, confirmLabel: props.confirmLabel };
  };

  it('단판이면 피리어드 칸이 없고, 새 골은 첫 피리어드로 제출된다', () => {
    const { onConfirm, confirmLabel } = renderWith(1);
    expect(screen.queryByLabelText('1번째 득점 피리어드')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
    expect(screen.queryByLabelText('2번째 득점 피리어드')).toBeNull();
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '단판 득점 추가' } });
    fireEvent.click(screen.getByRole('button', { name: confirmLabel }));

    expect(onConfirm.mock.calls[0][0].goalEvents).toEqual([
      expect.objectContaining({ id: 'goal-1', period: 1 }),
      expect.objectContaining({ period: 1 }),
    ]);
  });

  it.each([[2], [null], [undefined]])('periodCount=%s 이면 피리어드 칸이 그대로 있다', (periodCount) => {
    renderWith(periodCount);
    expect(screen.getByLabelText('1번째 득점 피리어드')).toBeInTheDocument();
  });
});

describe('ResultEditModal — 공식 득점 타임라인 편집', () => {
  it('실제 pinned period만 선택하고 변경한 period를 payload에 보존한다', () => {
    const { onConfirm } = submitEdit(
      {
        goalEvents: [
          { id: 'goal-period', sideId: HOME_SIDE_ID, participantId: HOME_PARTICIPANT_ID, minute: 1, period: 2, ownGoal: false },
        ],
      },
      ({ confirmLabel }) => {
        const period = screen.getByLabelText('1번째 득점 피리어드');
        expect(screen.getByRole('option', { name: '전반' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '후반' })).toBeInTheDocument();
        fireEvent.change(period, { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '득점 피리어드 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    expect(onConfirm.mock.calls[0][0].goalEvents).toEqual([
      expect.objectContaining({ id: 'goal-period', period: 1 }),
    ]);
  });

  it('득점 순서와 자책골 유형을 수정해 제출한다', () => {
    const { onConfirm } = submitEdit(
      {
        goalEvents: [
          { id: 'goal-1', sideId: HOME_SIDE_ID, participantId: HOME_PARTICIPANT_ID, minute: 1, period: 1, ownGoal: false },
          { id: 'goal-2', sideId: AWAY_SIDE_ID, participantId: AWAY_PARTICIPANT_ID, minute: 3, period: 1, ownGoal: false },
        ],
      },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('2번째 득점 유형'), { target: { value: 'OWN_GOAL' } });
        fireEvent.click(screen.getAllByRole('button', { name: '위로' })[1]);
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '득점 순서 및 자책골 정정' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    expect(onConfirm.mock.calls[0][0].goalEvents).toEqual([
      expect.objectContaining({ id: 'goal-2', ownGoal: true, anonymous: true }),
      expect.objectContaining({ id: 'goal-1', ownGoal: false }),
    ]);
  });

  it('선수를 지정하지 않은 새 골은 명시적인 익명 플래그로 제출한다', () => {
    const { onConfirm } = submitEdit({ score: { home: 0, away: 0 } }, ({ confirmLabel }) => {
      fireEvent.click(screen.getByRole('button', { name: '득점 추가' }));
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: '익명 득점 추가' } });
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
    });

    expect(onConfirm.mock.calls[0][0].goalEvents).toEqual([
      expect.objectContaining({
        sideId: HOME_SIDE_ID,
        anonymous: true,
        ownGoal: false,
      }),
    ]);
    expect(onConfirm.mock.calls[0][0].goalEvents[0]).not.toHaveProperty('participantId');
  });
});

/**
 * 서버(`assertGoalTimelineConsistent`)는 점수·득점 기록·선수 득점이 어긋난 정정을 422 로
 * 거부하고, 그 문구는 영문이다. 운영자가 영문 오류를 보기 전에 화면이 먼저 막고 알려야 한다.
 */
describe('ResultEditModal — 점수와 득점 기록이 어긋나면 제출 전에 막는다', () => {
  const mismatchAlert = () => screen.queryByRole('alert');

  it('홈 점수만 올리고 득점 기록은 그대로면 한국어 안내와 함께 제출이 막힌다', () => {
    const { onConfirm } = submitEdit({}, ({ confirmLabel }) => {
      fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: '점수 정정' } });

      const confirm = screen.getByRole('button', { name: confirmLabel });
      expect(confirm).toBeDisabled();
      expect(mismatchAlert()).toHaveTextContent('점수(2:0)와 득점 기록(1:0)이 달라요');
      expect(confirm).toHaveAttribute('aria-describedby', mismatchAlert()?.id);
      fireEvent.click(confirm);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('원정 쪽만 어긋나도 막고, 득점 기록을 맞추면 안내가 사라지고 제출된다', () => {
    const { onConfirm } = submitEdit({}, ({ confirmLabel }) => {
      fireEvent.change(screen.getByLabelText('원정 점수'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('사유'), { target: { value: '원정 득점 누락' } });
      expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
      expect(mismatchAlert()).toHaveTextContent('점수(1:1)와 득점 기록(1:0)이 달라요');

      addGoal(AWAY_SIDE_ID);
      expect(mismatchAlert()).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
    });

    expect(onConfirm.mock.calls[0][0].score).toEqual({ home: 1, away: 1 });
  });

  it('선수별 득점 수가 득점 기록과 다르면 막고, 자책골은 선수 득점으로 세지 않는다', () => {
    const { onConfirm } = submitEdit(
      {
        // 홈 팀 선수의 자책골이 아니라 원정 선수가 넣은 자책골이 홈 득점이 된다.
        goalEvents: [
          { id: 'goal-1', sideId: HOME_SIDE_ID, participantId: AWAY_PARTICIPANT_ID, ownGoal: true },
        ],
      },
      ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '자책골 확인' } });
        expect(screen.getByRole('button', { name: confirmLabel })).toBeEnabled();

        fireEvent.change(screen.getAllByLabelText('득점')[1], { target: { value: '1' } });
        expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
        expect(mismatchAlert()).toHaveTextContent('선수별 득점 수가 득점 기록과 달라요');

        fireEvent.change(screen.getAllByLabelText('득점')[1], { target: { value: '0' } });
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      },
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
  describe('득점 기록 없이 점수만 있는 결과(간편 결과)', () => {
    it('점수만 고치면 막지 않고 goalEvents 를 보내지 않아 서버가 기존 상태를 유지하게 한다', () => {
      const { onConfirm } = submitEdit({ score: { home: 2, away: 1 }, goalEvents: [] }, ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '점수 정정' } });
        expect(mismatchAlert()).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm.mock.calls[0][0].score).toEqual({ home: 3, away: 1 });
      expect(onConfirm.mock.calls[0][0]).not.toHaveProperty('goalEvents');
    });

    it('득점 기록을 더하면 점수가 기록 수를 따라가고, 그 기록과 함께 goalEvents 를 보낸다', () => {
      const { onConfirm } = submitEdit({ score: { home: 2, away: 1 }, goalEvents: [] }, ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '기록 추가' } });
        addGoal(HOME_SIDE_ID);
        expect(mismatchAlert()).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: confirmLabel }));
      });

      expect(onConfirm.mock.calls[0][0].score).toEqual({ home: 1, away: 0 });
      expect(onConfirm.mock.calls[0][0].goalEvents).toHaveLength(1);
    });

    it('선수 득점을 입력하면 기록이 없는 채로는 점수 전용으로 보지 않고 막는다', () => {
      const { onConfirm } = submitEdit({ score: { home: 2, away: 1 }, goalEvents: [] }, ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '선수 득점' } });
        fireEvent.change(screen.getAllByLabelText('득점')[0], { target: { value: '1' } });
        expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
        expect(mismatchAlert()).toHaveTextContent('점수(2:1)와 득점 기록(0:0)이 달라요');
      });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('원본이 0:0 이고 기록도 없으면 점수만 올리는 것은 여전히 막는다', () => {
      submitEdit({ score: { home: 0, away: 0 }, goalEvents: [] }, ({ confirmLabel }) => {
        fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '점수 정정' } });
        expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
        expect(mismatchAlert()).toHaveTextContent('점수(1:0)와 득점 기록(0:0)이 달라요');
      });
    });

    it('기록이 있던 결과에서 기록을 모두 지우고 점수를 남기면 점수 전용으로 취급하지 않는다', () => {
      submitEdit({}, ({ confirmLabel }) => {
        fireEvent.click(screen.getByRole('button', { name: /삭제/ }));
        fireEvent.change(screen.getByLabelText('홈 점수'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('사유'), { target: { value: '기록 삭제' } });
        expect(screen.getByRole('button', { name: confirmLabel })).toBeDisabled();
      });
    });
  });
});

describe('ResultEditModal 점수만 확정된 경기 안내 (MD-QA #94)', () => {
  it('원래 득점 기록이 없으면 점수만 고쳐도 된다고 안내한다', () => {
    const props = baseProps();
    render(<ResultEditModal {...props} base={{ ...props.base, goalEvents: [] }} lineups={[]} />);
    expect(screen.getByText(/득점 기록 없이 점수만 확정된 경기예요/)).toBeInTheDocument();
  });
});
