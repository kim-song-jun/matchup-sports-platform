import { CompetitionConfig } from './competition-config.types';

export const REQUIRED_TIE_BREAK_ORDER: CompetitionConfig['tieBreak']['order'] = [
  'points',
  'head_to_head',
  'goal_difference',
  'goals_for',
  'fair_play',
  'seeded_draw',
];

const FOOTBALL_POSITIONS: CompetitionConfig['lineup']['positions'] = [
  { code: 'GK', label: '골키퍼', short: 'GK', goalkeeper: true },
  { code: 'DF', label: '수비수', short: 'DF' },
  { code: 'MF', label: '미드필더', short: 'MF' },
  { code: 'FW', label: '공격수', short: 'FW' },
];

// 축구 11인제 포메이션 좌표는 설계 문서 어디에도 없다(§T1-5 JSON은 풋살 전용). 없는
// 데이터를 창작하지 않고 빈 배열로 둔다 — validator·DB 트리거 모두 formations의 빈
// 배열을 유효한 상태로 취급한다(§6 범위 밖 원칙).
const FOOTBALL_FORMATIONS: CompetitionConfig['lineup']['formations'] = [];

const FUTSAL_POSITIONS: CompetitionConfig['lineup']['positions'] = [
  { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
  { code: 'FIXO', label: '픽소', short: 'FX' },
  { code: 'ALA', label: '아라', short: 'AL' },
  { code: 'PIVO', label: '피보', short: 'PV' },
];

// 설계 문서 §T1-5(y=0 자기 골라인/y=100 하프라인 정정본)를 그대로 옮긴 값. 골키퍼
// 슬롯(50,6)은 서비스가 항상 별도로 붙이므로 여기 slots에는 없다.
const FUTSAL_FORMATIONS: CompetitionConfig['lineup']['formations'] = [
  {
    code: '1-2-1',
    label: '다이아몬드',
    outfield: 4,
    slots: [
      { position: 'FIXO', x: 50, y: 35 },
      { position: 'ALA', x: 20, y: 58 },
      { position: 'ALA', x: 80, y: 58 },
      { position: 'PIVO', x: 50, y: 83 },
    ],
  },
  {
    code: '2-2',
    label: '박스',
    outfield: 4,
    slots: [
      { position: 'FIXO', x: 28, y: 38 },
      { position: 'FIXO', x: 72, y: 38 },
      { position: 'PIVO', x: 28, y: 76 },
      { position: 'PIVO', x: 72, y: 76 },
    ],
  },
  {
    code: '3-1',
    label: '라인 오브 스리',
    outfield: 4,
    slots: [
      { position: 'ALA', x: 18, y: 43 },
      { position: 'FIXO', x: 50, y: 43 },
      { position: 'ALA', x: 82, y: 43 },
      { position: 'PIVO', x: 50, y: 80 },
    ],
  },
  {
    code: '2-2-1',
    label: '박스 + 피보',
    outfield: 5,
    slots: [
      { position: 'FIXO', x: 27, y: 33 },
      { position: 'FIXO', x: 73, y: 33 },
      { position: 'ALA', x: 22, y: 59 },
      { position: 'ALA', x: 78, y: 59 },
      { position: 'PIVO', x: 50, y: 85 },
    ],
  },
  {
    code: '1-3-1',
    label: '다이아몬드 확장',
    outfield: 5,
    slots: [
      { position: 'FIXO', x: 50, y: 31 },
      { position: 'ALA', x: 17, y: 56 },
      { position: 'ALA', x: 50, y: 56 },
      { position: 'ALA', x: 83, y: 56 },
      { position: 'PIVO', x: 50, y: 85 },
    ],
  },
  {
    code: '3-1-1',
    label: '라인오브스리 + 링커',
    outfield: 5,
    slots: [
      { position: 'ALA', x: 18, y: 34 },
      { position: 'FIXO', x: 50, y: 34 },
      { position: 'ALA', x: 82, y: 34 },
      { position: 'ALA', x: 50, y: 60 },
      { position: 'PIVO', x: 50, y: 85 },
    ],
  },
];

export const FOOTBALL_V1_CONFIG: CompetitionConfig = {
  periods: [
    { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
    { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
  ],
  events: ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'],
  lineup: {
    minPlayers: 7,
    maxPlayers: 11,
    substitutions: 'limited',
    maxSubstitutions: 5,
    positions: FOOTBALL_POSITIONS,
    formations: FOOTBALL_FORMATIONS,
  },
  result: {
    tournamentScorerPolicy: 'required',
    teamMatchScorerPolicy: 'optional_with_warning',
    mvpMin: 0,
    mvpMax: 1,
  },
  tieBreak: {
    points: { win: 3, draw: 1, loss: 0 },
    order: REQUIRED_TIE_BREAK_ORDER,
    seededDraw: 'sha256-v1',
  },
  visibility: { default: 'live', allowed: ['live', 'official'] },
};

export const FUTSAL_V1_CONFIG: CompetitionConfig = {
  periods: [
    { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
    { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
  ],
  events: ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'FOUL'],
  lineup: {
    minPlayers: 3,
    // team-match-conditions.constants.ts의 futsal 경기방식 프리셋(6:6/5:5/4:4)이 이미
    // '6:6'을 제안하는데 이 값이 5면 6:6으로 만든 매치의 라인업 저장이 항상
    // LINEUP_SIZE_INVALID로 막힌다 — 실사용자가 부딪히는 버그였다. 6으로 올리면
    // FUTSAL_FORMATIONS의 outfield:5 대형(2-2-1/1-3-1/3-1-1, 이미 존재 — 새로 만들지
    // 않음)이 GK 1명과 합쳐 정확히 6명을 채운다. 이 숫자 자체는 여전히 하나의 기본값일
    // 뿐 — 실제 상한 조정은 CompetitionConfigRegistry.createVersion()(POST
    // /admin/competition-configs/:configId/versions)이 관리자가 이미 쓸 수 있는
    // 정식 경로다: 새 버전 행은 V1CompetitionConfigVersion.status가 스키마 기본값으로
    // ACTIVE라 team-match 쪽은 만들자마자 자동으로 이 값을 따라가고, tournament 쪽은
    // TournamentCompetitionConfig.change()로 특정 버전에 명시적으로 pin할 수 있다.
    maxPlayers: 6,
    substitutions: 'rolling',
    maxSubstitutions: null,
    positions: FUTSAL_POSITIONS,
    formations: FUTSAL_FORMATIONS,
  },
  result: {
    tournamentScorerPolicy: 'required',
    teamMatchScorerPolicy: 'optional_with_warning',
    mvpMin: 0,
    mvpMax: 1,
  },
  tieBreak: {
    points: { win: 3, draw: 1, loss: 0 },
    order: REQUIRED_TIE_BREAK_ORDER,
    seededDraw: 'sha256-v1',
  },
  visibility: { default: 'live', allowed: ['live', 'official'] },
};
