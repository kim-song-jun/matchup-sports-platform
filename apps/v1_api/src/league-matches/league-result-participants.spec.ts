import {
  assembleLeagueResultParticipants,
  carryForwardResultParticipants,
  type LeagueSideRoster,
  type StoredResultParticipantRow,
} from './league-result-participants';

const sides = [
  { id: 'side-home', sideKey: 'HOME' as const },
  { id: 'side-away', sideKey: 'AWAY' as const },
];

/**
 * 이 대진의 `V1GameParticipant` 전체 — 라인업 리비전마다 행이 **쌓이므로** 최신 리비전
 * 밖의 행(p-h0)도 여전히 존재한다. 조립 함수는 "이 게임 소속인가" 검증에만 이 목록을 쓰고,
 * 출전 기록 여부는 아래 로스터(최신 리비전)로 판단한다.
 */
const gameParticipants = [
  { id: 'p-h0', sideId: 'side-home' },
  { id: 'p-h1', sideId: 'side-home' },
  // p-h1 과 **같은 사람**(u-1)의 옛 라인업 리비전 행. 알파에는 이 행에 득점이 달린 채
  // 확정된 경기가 실제로 있다(득점자 드롭다운이 같은 이름을 2~3번 보여주던 시절).
  { id: 'p-h1-old', sideId: 'side-home' },
  { id: 'p-h2', sideId: 'side-home' },
  { id: 'p-h3', sideId: 'side-home' },
  { id: 'p-a1', sideId: 'side-away' },
  { id: 'p-a2', sideId: 'side-away' },
];

/**
 * 참가자 행 → 실제 사용자. 같은 사람의 행이 결과에 두 번 실리지 않게 접는 근거다.
 * p-h0 은 최신 명단에서 아예 빠진 **다른 사람**(u-0)이라 접히지 않고 그대로 남는다.
 */
const userIdByParticipantId = new Map<string, string | null>([
  ['p-h0', 'u-0'],
  ['p-h1', 'u-1'],
  ['p-h1-old', 'u-1'],
  ['p-h2', 'u-2'],
  ['p-h3', 'u-3'],
  ['p-a1', 'u-a1'],
  ['p-a2', 'u-a2'],
]);

/**
 * 홈: 팀이 직접 작성한 라인업(골키퍼 1 + 필드 1 + 후보 1).
 * 골키퍼는 team-match 관례대로 'GK' 리터럴이고, **선발/후보 구분은 없다**(정본 §3) — 예전엔
 * position='BENCH' 센티널이었다(Task 163 BE-3 에서 컬럼으로 옮겼다).
 */
const authoredHomeRoster: LeagueSideRoster = {
  sideId: 'side-home',
  teamAuthored: true,
  participants: [
    { id: 'p-h1', sideId: 'side-home', position: 'GK' },
    { id: 'p-h2', sideId: 'side-home', position: 'PIVO' },
    { id: 'p-h3', sideId: 'side-home', position: null },
  ],
};

/** 원정: 팀이 라인업을 한 번도 저장하지 않아 대진 생성이 만든 자동 로스터(position 없음)뿐이다. */
const autoAwayRoster: LeagueSideRoster = {
  sideId: 'side-away',
  teamAuthored: false,
  participants: [
    { id: 'p-a1', sideId: 'side-away', position: null },
    { id: 'p-a2', sideId: 'side-away', position: null },
  ],
};

const rosters = [authoredHomeRoster, autoAwayRoster];

function assemble(overrides: {
  participants: Array<{ participantId: string; goals: number; assists?: number }>;
  rosters?: LeagueSideRoster[];
  goalkeeperPositionCode?: string;
  userIdByParticipantId?: ReadonlyMap<string, string | null>;
  hasGameEvents?: boolean;
  homeScore: number;
  awayScore: number;
}) {
  return assembleLeagueResultParticipants({
    participants: overrides.participants,
    gameParticipants,
    sides,
    rosters: overrides.rosters ?? rosters,
    goalkeeperPositionCode: overrides.goalkeeperPositionCode ?? 'GOLEIRO',
    userIdByParticipantId: overrides.userIdByParticipantId ?? userIdByParticipantId,
    hasGameEvents: overrides.hasGameEvents ?? false,
    homeScore: overrides.homeScore,
    awayScore: overrides.awayScore,
  });
}

describe('assembleLeagueResultParticipants', () => {
  it('팀이 작성한 라인업이 있는 사이드는 로스터 전원을 출전 기록으로 남긴다 (무득점 포함, 전원 started=true)', () => {
    const result = assemble({
      // p-h2·p-h3 는 아무 기록도 없다 — 그래도 뛴 사람이므로 행이 남아야 한다.
      participants: [{ participantId: 'p-h1', goals: 1 }],
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toEqual({
      ok: true,
      actualParticipants: [
        {
          participantId: 'p-h1',
          sideId: 'side-home',
          started: true,
          goals: 1,
          cards: { yellow: 0, red: 0 },
          // team-match 라인업은 골키퍼를 리터럴 'GK'로 저장한다 — 종목 코드가 'GOLEIRO'인
          // 풋살에서도 이 사람은 골키퍼다. config 코드만 비교하면 여기가 false로 무너진다.
          goalkeeper: true,
        },
        {
          participantId: 'p-h2',
          sideId: 'side-home',
          started: true,
          goals: 0,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
        {
          participantId: 'p-h3',
          sideId: 'side-home',
          started: true,
          goals: 0,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
      ],
    });
  });

  /**
   * 마이그레이션 `20260902000000_v1_lineup_bench_to_started` 가 이 프로젝션을 바꾸지
   * **않는다**는 계약. 골키퍼 판정은 `position` 만 보고 `started` 를 보지 않는다
   * (games.service.ts:6433,6877 의 결과 프로젝션과 같은 규칙).
   *
   * 왜 이걸 못 박나: 마이그레이션이 만지는 것은 position='BENCH' 인 행뿐이고 'BENCH' 는
   * 어느 종목에서도 골키퍼 코드가 아니다 — 전에도 후에도 goalkeeper=false 다. 반대로
   * 진짜 골키퍼 행의 position('GK'/'GOLEIRO')은 마이그레이션이 건드리지 않는다. 그래서
   * 전후가 같다. 이 성질은 **판정이 position 만 볼 때만** 성립하므로, 누군가 "후보는
   * 골키퍼일 수 없다"며 started 를 조건에 끼워 넣으면 그 순간 전후가 갈린다.
   */
  it('골키퍼 판정은 position 만 본다 — started 와 무관하게 GK 포지션이면 골키퍼다', () => {
    const result = assemble({
      participants: [],
      rosters: [
        {
          sideId: 'side-home',
          teamAuthored: true,
          participants: [
            { id: 'p-h1', sideId: 'side-home', position: 'GK' },
            { id: 'p-h2', sideId: 'side-home', position: 'GOLEIRO' },
            // 마이그레이션이 옛 후보를 옮겨 놓은 모양. 골키퍼가 아니다 — 전에도(position
            // 이 'BENCH' 였을 때) 아니었다.
            { id: 'p-h3', sideId: 'side-home', position: null },
          ],
        },
      ],
      homeScore: 0,
      awayScore: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      actualParticipants: [
        { participantId: 'p-h1', started: true, goalkeeper: true },
        { participantId: 'p-h2', started: true, goalkeeper: true },
        { participantId: 'p-h3', started: true, goalkeeper: false },
      ],
    });
  });

  it('종목 사전의 골키퍼 코드(풋살 GOLEIRO)로 저장된 라인업도 골키퍼로 인정한다', () => {
    const result = assemble({
      participants: [],
      rosters: [
        {
          sideId: 'side-home',
          teamAuthored: true,
          participants: [{ id: 'p-h1', sideId: 'side-home', position: 'GOLEIRO' }],
        },
      ],
      homeScore: 0,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: true, actualParticipants: [{ participantId: 'p-h1', goalkeeper: true }] });
  });

  it('자동 로스터뿐인 사이드는 기록이 있는 선수만 저장한다 (뛰지 않은 팀원의 허위 출전을 만들지 않는다)', () => {
    const result = assemble({
      participants: [{ participantId: 'p-a1', goals: 1 }],
      // 홈도 자동 로스터로 바꿔 양쪽 모두 증거가 없는 상태로 만든다.
      rosters: [
        { ...authoredHomeRoster, teamAuthored: false },
        autoAwayRoster,
      ],
      homeScore: 0,
      awayScore: 1,
    });
    expect(result).toEqual({
      ok: true,
      actualParticipants: [
        {
          participantId: 'p-a1',
          sideId: 'side-away',
          // 기록이 있으니 뛴 사람이다 — 명단 = 출전자(정본 §3).
          started: true,
          goals: 1,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
      ],
    });
    // 자동 로스터의 나머지 팀원(p-a2, 홈 3명)은 한 명도 실리지 않아야 한다.
    expect(result.ok && result.actualParticipants).toHaveLength(1);
  });

  it('최신 라인업에서 빠졌지만 기록이 실린 선수(승계 대상)는 그대로 저장한다', () => {
    // p-h0 은 옛 라인업 리비전의 행이라 최신 로스터에 없다. 정정 모달이 기존 공식 기록을
    // 그 id 로 프리필해 다시 보내는 경우 — 여기서 떨어뜨리면 그 사람의 기록이 사라진다.
    const result = assemble({
      participants: [{ participantId: 'p-h0', goals: 2, assists: 1 }],
      homeScore: 2,
      awayScore: 0,
    });
    expect(result.ok && result.actualParticipants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: 'p-h0', goals: 2, assists: 1, started: true }),
      ]),
    );
    // 로스터 전원(3명) + 승계 1명.
    expect(result.ok && result.actualParticipants).toHaveLength(4);
  });

  it('옛 라인업 행에 달린 기록은 같은 사람의 최신 행으로 접힌다 (한 경기·한 사람 = 결과 행 하나)', () => {
    // 정정 모달이 현재 공식 기록(p-h1-old = u-1)을 프리필해 그대로 되보내는 상황.
    // 접지 않으면 u-1 이 이 경기에서 결과 행을 두 개 갖게 되고, 개인 기록의 출전 수가
    // 1 부풀며 전적 목록에 같은 경기가 두 번 뜬다(PublicUserRecordsService 는 행 수를 센다).
    const result = assemble({
      participants: [{ participantId: 'p-h1-old', goals: 1, assists: 1 }],
      homeScore: 1,
      awayScore: 0,
    });
    const rows = result.ok ? result.actualParticipants : [];
    expect(rows.map((row) => row.participantId)).toEqual(['p-h1', 'p-h2', 'p-h3']);
    // 기록은 최신 행으로 이관된다 — 옛 행의 득점·도움이 사라지면 안 된다.
    expect(rows[0]).toEqual({
      participantId: 'p-h1',
      sideId: 'side-home',
      started: true,
      goals: 1,
      assists: 1,
      cards: { yellow: 0, red: 0 },
      goalkeeper: true,
    });
  });

  it('같은 사람의 옛 행과 최신 행에 각각 기록이 있으면 합산한다', () => {
    const result = assemble({
      participants: [
        { participantId: 'p-h1', goals: 1 },
        { participantId: 'p-h1-old', goals: 1, assists: 1 },
      ],
      homeScore: 2,
      awayScore: 0,
    });
    const rows = result.ok ? result.actualParticipants : [];
    expect(rows.filter((row) => row.participantId === 'p-h1')).toEqual([
      {
        participantId: 'p-h1',
        sideId: 'side-home',
        started: true,
        goals: 2,
        assists: 1,
        cards: { yellow: 0, red: 0 },
        goalkeeper: true,
      },
    ]);
    expect(rows.map((row) => row.participantId)).not.toContain('p-h1-old');
  });

  it('userId 가 없는 게스트는 접지 않는다 (이름이 같아도 동일인이라는 근거가 없다)', () => {
    // 동명이인·게스트를 이름으로 묶으면 남의 득점이 다른 사람에게 붙는다 — 이 저장소가
    // 라인업 저장에서 id 를 직접 받는 이유와 같은 위험이라 게스트는 각자 남긴다.
    const result = assemble({
      participants: [
        { participantId: 'p-a1', goals: 1 },
        { participantId: 'p-a2', goals: 1 },
      ],
      userIdByParticipantId: new Map<string, string | null>([
        ['p-a1', null],
        ['p-a2', null],
      ]),
      // 원정(자동 로스터)만 남겨 게스트 두 행이 그대로 실리는지 본다.
      rosters: [{ ...authoredHomeRoster, teamAuthored: false }, autoAwayRoster],
      homeScore: 0,
      awayScore: 2,
    });
    expect(result.ok && result.actualParticipants.map((row) => row.participantId)).toEqual(['p-a1', 'p-a2']);
  });

  it('사이드가 다르면 같은 userId 라도 접지 않는다 (득점이 상대 팀으로 넘어가면 안 된다)', () => {
    // 양 팀에 동시에 소속된 사람이 각 팀 명단에 실린 경우. 접으면 원정 득점이 홈으로
    // 옮겨 가 사이드별 스코어 검증이 통째로 무의미해진다.
    const result = assemble({
      participants: [
        { participantId: 'p-h1', goals: 1 },
        { participantId: 'p-a1', goals: 1 },
      ],
      userIdByParticipantId: new Map<string, string | null>([
        ['p-h1', 'u-same'],
        ['p-a1', 'u-same'],
      ]),
      rosters: [{ ...authoredHomeRoster, teamAuthored: false }, autoAwayRoster],
      homeScore: 1,
      awayScore: 1,
    });
    const rows = result.ok ? result.actualParticipants : [];
    expect(rows.map((row) => ({ id: row.participantId, sideId: row.sideId, goals: row.goals }))).toEqual([
      { id: 'p-h1', sideId: 'side-home', goals: 1 },
      { id: 'p-a1', sideId: 'side-away', goals: 1 },
    ]);
  });

  it('명시적 빈 배열은 득점·도움만 비우고 출전 기록은 라인업대로 남긴다', () => {
    // `[]` 를 "이 경기 기록 전체 삭제"로 읽으면 정상적인 0-0 입력 한 번에 그 경기의
    // 출전 기록이 통째로 사라진다. 출전은 이 배열이 주장하는 값이 아니라 라인업 파생값이다.
    const result = assemble({ participants: [], homeScore: 0, awayScore: 0 });
    const rows = result.ok ? result.actualParticipants : [];
    expect(rows.map((row) => row.participantId)).toEqual(['p-h1', 'p-h2', 'p-h3']);
    expect(rows.every((row) => row.goals === 0 && row.assists === undefined)).toBe(true);
  });

  it('빈 배열이어도 자동 로스터뿐인 사이드에는 아무 행도 만들지 않는다', () => {
    const result = assemble({
      participants: [],
      rosters: [{ ...authoredHomeRoster, teamAuthored: false }, autoAwayRoster],
      homeScore: 0,
      awayScore: 0,
    });
    expect(result).toEqual({ ok: true, actualParticipants: [] });
  });

  it('이 게임에 이벤트 행이 있으면 로스터 전원 기록을 끄고 기록이 있는 행만 저장한다', () => {
    // 이벤트가 있으면 validateGameResultInvariants 의 TEAM_MATCH 면제가 풀려서 실린 행
    // 전부의 득점·카드가 이벤트와 일치해야 한다. 로스터 전원을 cards:{0,0} 으로 실으면
    // 운영자가 손댈 수 없는 값 때문에 SCORE_EVENT_MISMATCH 로 결과 입력 자체가 막힌다.
    const result = assemble({
      participants: [{ participantId: 'p-h1', goals: 1 }],
      hasGameEvents: true,
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toEqual({
      ok: true,
      actualParticipants: [
        {
          participantId: 'p-h1',
          sideId: 'side-home',
          started: true,
          goals: 1,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
      ],
    });
  });

  it('같은 participantId 가 결과에 두 번 실리지 않는다', () => {
    const result = assemble({
      participants: [{ participantId: 'p-h1', goals: 1 }],
      homeScore: 1,
      awayScore: 0,
    });
    const ids = result.ok ? result.actualParticipants.map((row) => row.participantId) : [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('이 게임 소속이 아닌 participantId 는 거부한다', () => {
    const result = assemble({
      participants: [{ participantId: 'p-외부', goals: 1 }],
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_PARTICIPANT_NOT_IN_GAME' });
  });

  it('같은 선수가 두 번 실리면 거부한다', () => {
    const result = assemble({
      participants: [
        { participantId: 'p-h1', goals: 1 },
        { participantId: 'p-h1', goals: 1 },
      ],
      homeScore: 2,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_PARTICIPANT_DUPLICATED' });
  });

  it('사이드별 득점 합이 그 팀 스코어를 넘으면 거부한다 (자책골 여지로 미만은 허용)', () => {
    const over = assemble({
      participants: [
        { participantId: 'p-h1', goals: 2 },
        { participantId: 'p-h2', goals: 2 },
      ],
      homeScore: 3,
      awayScore: 0,
    });
    expect(over).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_GOALS_EXCEED_SCORE' });

    const under = assemble({
      participants: [{ participantId: 'p-h1', goals: 1 }],
      homeScore: 3,
      awayScore: 0,
    });
    expect(under).toMatchObject({ ok: true });
  });

  it('사이드별 도움 합이 기록된 득점 합을 넘으면 거부한다 (스코어가 아니라 득점 기준)', () => {
    const result = assemble({
      participants: [
        { participantId: 'p-h1', goals: 0, assists: 2 },
        { participantId: 'p-h2', goals: 1 },
      ],
      homeScore: 3,
      awayScore: 0,
    });
    // 스코어(3) 기준이면 통과했겠지만, 기록된 득점 합은 1 — 도움 2는 불가능한 기록이다.
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_ASSISTS_EXCEED_GOALS' });
  });

  it('기록된 득점이 0인 사이드의 도움은 거부한다 (자책골로 스코어만 있는 경우)', () => {
    const result = assemble({
      participants: [{ participantId: 'p-h1', goals: 0, assists: 1 }],
      homeScore: 1,
      awayScore: 0,
    });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_ASSISTS_EXCEED_GOALS' });
  });
});

describe('carryForwardResultParticipants', () => {
  const storedHome = {
    participantId: 'p-h1',
    sideId: 'side-home',
    started: false,
    minutesPlayed: 40,
    goals: 2,
    assists: 1,
    fouls: 3,
    cards: { yellow: 1, red: 0 },
    goalkeeper: false,
  };
  const storedAway = {
    participantId: 'p-a1',
    sideId: 'side-away',
    started: false,
    minutesPlayed: null,
    goals: 1,
    assists: 0,
    fouls: 0,
    cards: null,
    goalkeeper: true,
  };

  function carry(overrides: {
    rows: StoredResultParticipantRow[];
    rosters?: LeagueSideRoster[];
    userIdByParticipantId?: ReadonlyMap<string, string | null>;
    hasGameEvents?: boolean;
    homeScore: number;
    awayScore: number;
  }) {
    return carryForwardResultParticipants({
      rows: overrides.rows,
      sides,
      rosters: overrides.rosters ?? rosters,
      goalkeeperPositionCode: 'GOLEIRO',
      userIdByParticipantId: overrides.userIdByParticipantId ?? userIdByParticipantId,
      hasGameEvents: overrides.hasGameEvents ?? false,
      homeScore: overrides.homeScore,
      awayScore: overrides.awayScore,
    });
  }

  it('직전 공식 기록을 필드 손실 없이 승계하고, 라인업에만 있는 무득점 선수를 출전 기록으로 채운다', () => {
    const result = carry({ rows: [storedHome, storedAway], homeScore: 2, awayScore: 1 });
    expect(result).toEqual({
      ok: true,
      actualParticipants: [
        {
          participantId: 'p-h1',
          sideId: 'side-home',
          // 라인업에 있는 사람은 출전자다(정본 §3). goalkeeper 는 운영자 입력이 아니라
          // 라인업 파생값이라 저장값이 아니라 라인업에서 다시 읽는다.
          started: true,
          goals: 2,
          assists: 1,
          fouls: 3,
          minutesPlayed: 40,
          cards: { yellow: 1, red: 0 },
          goalkeeper: true,
        },
        {
          participantId: 'p-h2',
          sideId: 'side-home',
          started: true,
          goals: 0,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
        {
          participantId: 'p-h3',
          sideId: 'side-home',
          started: true,
          goals: 0,
          cards: { yellow: 0, red: 0 },
          goalkeeper: false,
        },
        {
          // 원정은 자동 로스터뿐이라 저장된 행만 그대로 승계된다(허위 출전 없음).
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

  it('자동 로스터뿐인 사이드는 저장된 기록만 승계한다 (팀원 전원을 출전으로 만들지 않는다)', () => {
    const result = carry({
      rows: [storedAway],
      rosters: [{ ...authoredHomeRoster, teamAuthored: false }, autoAwayRoster],
      homeScore: 0,
      awayScore: 1,
    });
    expect(result.ok && result.actualParticipants.map((row) => row.participantId)).toEqual(['p-a1']);
  });

  it('스코어를 낮추는 정정으로 승계 득점 합이 새 스코어를 넘으면 거부한다', () => {
    const result = carry({ rows: [storedHome], homeScore: 1, awayScore: 0 });
    expect(result).toMatchObject({ ok: false, code: 'LEAGUE_RESULT_CARRIED_PARTICIPANTS_CONFLICT' });
  });

  it('옛 라인업 행에 저장된 기록을 같은 사람의 최신 행으로 접어 승계한다', () => {
    // participants 미전송 정정에서도 같은 결함이 난다: ①이 최신 로스터(p-h1 포함)를 싣고
    // ②가 저장된 옛 행(p-h1-old)을 추가로 실어 u-1 에게 결과 행이 두 개 생긴다.
    const staleHome: StoredResultParticipantRow = {
      participantId: 'p-h1-old',
      sideId: 'side-home',
      started: false,
      minutesPlayed: null,
      goals: 2,
      assists: 1,
      fouls: 0,
      cards: { yellow: 1, red: 0 },
      goalkeeper: false,
    };
    const result = carry({ rows: [staleHome], homeScore: 2, awayScore: 0 });
    const rows = result.ok ? result.actualParticipants : [];
    expect(rows.map((row) => row.participantId)).toEqual(['p-h1', 'p-h2', 'p-h3']);
    expect(rows[0]).toEqual({
      participantId: 'p-h1',
      sideId: 'side-home',
      // 출전 판정은 최신 라인업에서 다시 읽고(선발 골키퍼), 기록은 옛 행에서 이관한다.
      started: true,
      goals: 2,
      assists: 1,
      cards: { yellow: 1, red: 0 },
      goalkeeper: true,
    });
  });

  it('접어도 사이드별 득점 합은 그대로라 스코어 하향 정정 거부 임계가 흔들리지 않는다', () => {
    const staleHome: StoredResultParticipantRow = {
      participantId: 'p-h1-old',
      sideId: 'side-home',
      started: false,
      minutesPlayed: null,
      goals: 1,
      assists: 0,
      fouls: 0,
      cards: null,
      goalkeeper: false,
    };
    // 옛 행 1골 + 최신 행 1골 = 홈 2골. 정정 스코어 1은 거부, 2는 통과여야 한다.
    const rows = [staleHome, { ...storedHome, goals: 1, assists: 0 }];
    expect(carry({ rows, homeScore: 1, awayScore: 0 })).toMatchObject({
      ok: false,
      code: 'LEAGUE_RESULT_CARRIED_PARTICIPANTS_CONFLICT',
    });
    const merged = carry({ rows, homeScore: 2, awayScore: 0 });
    expect(merged.ok && merged.actualParticipants.filter((row) => row.participantId === 'p-h1')).toEqual([
      expect.objectContaining({ participantId: 'p-h1', goals: 2 }),
    ]);
  });

  it('이 게임에 이벤트 행이 있으면 저장된 기록만 승계하고 로스터는 채우지 않는다', () => {
    const result = carry({ rows: [storedHome], hasGameEvents: true, homeScore: 2, awayScore: 0 });
    expect(result.ok && result.actualParticipants.map((row) => row.participantId)).toEqual(['p-h1']);
    // 저장값을 그대로 승계한다(라인업 파생값으로 덮어쓰지 않는다) — 이벤트가 권위인 경기다.
    expect(result.ok && result.actualParticipants[0]).toMatchObject({ started: false, goalkeeper: false });
  });
});
