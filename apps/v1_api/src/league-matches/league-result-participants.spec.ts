import {
  assembleLeagueResultParticipants,
  carryForwardResultParticipants,
} from './league-result-participants';

const sides = [
  { id: 'side-home', sideKey: 'HOME' as const },
  { id: 'side-away', sideKey: 'AWAY' as const },
];
const gameParticipants = [
  { id: 'p-h1', sideId: 'side-home' },
  { id: 'p-h2', sideId: 'side-home' },
  { id: 'p-a1', sideId: 'side-away' },
];

describe('assembleLeagueResultParticipants', () => {
  it('사이드를 participant 행에서 도출하고, 0-0 기록은 제외하며, 기본 필드를 채운다', () => {
    const result = assembleLeagueResultParticipants({
      participants: [
        { participantId: 'p-h1', goals: 2, assists: 1 },
        { participantId: 'p-h2', goals: 0 },
        { participantId: 'p-a1', goals: 1 },
      ],
      gameParticipants,
      sides,
      homeScore: 3,
      awayScore: 1,
    });
    expect(result).toEqual({
      ok: true,
      actualParticipants: [
        {
          participantId: 'p-h1',
          sideId: 'side-home',
          started: false,
          goals: 2,
          assists: 1,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
        {
          participantId: 'p-a1',
          sideId: 'side-away',
          started: false,
          goals: 1,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
      ],
    });
  });

  it('이 게임 소속이 아닌 participantId 는 거부한다', () => {
    const result = assembleLeagueResultParticipants({
      participants: [{ participantId: 'p-외부', goals: 1 }],
      gameParticipants,
      sides,
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_PARTICIPANT_NOT_IN_GAME' });
  });

  it('같은 선수가 두 번 실리면 거부한다', () => {
    const result = assembleLeagueResultParticipants({
      participants: [
        { participantId: 'p-h1', goals: 1 },
        { participantId: 'p-h1', goals: 1 },
      ],
      gameParticipants,
      sides,
      homeScore: 2,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_PARTICIPANT_DUPLICATED' });
  });

  it('사이드별 득점 합이 그 팀 스코어를 넘으면 거부한다 (자책골 여지로 미만은 허용)', () => {
    const over = assembleLeagueResultParticipants({
      participants: [
        { participantId: 'p-h1', goals: 2 },
        { participantId: 'p-h2', goals: 2 },
      ],
      gameParticipants,
      sides,
      homeScore: 3,
      awayScore: 0,
    });
    expect(over).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_GOALS_EXCEED_SCORE' });

    const under = assembleLeagueResultParticipants({
      participants: [{ participantId: 'p-h1', goals: 1 }],
      gameParticipants,
      sides,
      homeScore: 3,
      awayScore: 0,
    });
    expect(under).toMatchObject({ ok: true });
  });

  it('사이드별 도움 합이 기록된 득점 합을 넘으면 거부한다 (스코어가 아니라 득점 기준)', () => {
    const result = assembleLeagueResultParticipants({
      participants: [
        { participantId: 'p-h1', goals: 0, assists: 2 },
        { participantId: 'p-h2', goals: 1 },
      ],
      gameParticipants,
      sides,
      homeScore: 3,
      awayScore: 0,
    });
    // 스코어(3) 기준이면 통과했겠지만, 기록된 득점 합은 1 — 도움 2는 불가능한 기록이다.
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_ASSISTS_EXCEED_GOALS' });
  });

  it('기록된 득점이 0인 사이드의 도움은 거부한다 (자책골로 스코어만 있는 경우)', () => {
    const result = assembleLeagueResultParticipants({
      participants: [{ participantId: 'p-h1', goals: 0, assists: 1 }],
      gameParticipants,
      sides,
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_ASSISTS_EXCEED_GOALS' });
  });
});

describe('carryForwardResultParticipants', () => {
  const storedRow = {
    participantId: 'p-h1',
    sideId: 'side-home',
    started: true,
    minutesPlayed: 40,
    goals: 2,
    assists: 1,
    fouls: 3,
    cards: { yellow: 1, red: 0 },
    goalkeeper: false,
  };

  it('직전 공식 기록을 필드 손실 없이 승계한다 (0/null 필드는 생략 매핑)', () => {
    const result = carryForwardResultParticipants({
      rows: [
        storedRow,
        { participantId: 'p-a1', sideId: 'side-away', started: false, minutesPlayed: null, goals: 1, assists: 0, fouls: 0, cards: null, goalkeeper: true },
      ],
      sides,
      homeScore: 2,
      awayScore: 1,
    });
    expect(result).toEqual({
      ok: true,
      actualParticipants: [
        {
          participantId: 'p-h1',
          sideId: 'side-home',
          started: true,
          goals: 2,
          assists: 1,
          fouls: 3,
          minutesPlayed: 40,
          cards: { yellow: 1, red: 0 },
          goalkeeper: false,
        },
        {
          participantId: 'p-a1',
          sideId: 'side-away',
          started: false,
          goals: 1,
          cards: { yellow: 0, red: 0 },
          goalkeeper: true,
        },
      ],
    });
  });

  it('스코어를 낮추는 정정으로 승계 득점 합이 새 스코어를 넘으면 거부한다', () => {
    const result = carryForwardResultParticipants({
      rows: [storedRow],
      sides,
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_CARRIED_PARTICIPANTS_CONFLICT' });
  });
});
