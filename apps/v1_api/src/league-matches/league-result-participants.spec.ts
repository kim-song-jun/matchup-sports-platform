import { assembleLeagueResultParticipants } from './league-result-participants';

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

  it('사이드별 도움 합이 그 팀 스코어를 넘으면 거부한다', () => {
    const result = assembleLeagueResultParticipants({
      participants: [
        { participantId: 'p-h1', goals: 0, assists: 2 },
        { participantId: 'p-h2', goals: 1 },
      ],
      gameParticipants,
      sides,
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_ASSISTS_EXCEED_SCORE' });
  });
});
