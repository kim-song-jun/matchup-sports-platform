/**
 * 용어집. 대회·리그·결과 용어는 docs/design/competition-canonical-flow.md(정본)의 뜻을 따른다 —
 * 정본이 바뀌면 여기도 같은 변경에서 고친다.
 */
export type GlossaryTerm = {
  /** URL 앵커(`/help/glossary#<id>`). */
  readonly id: string;
  readonly term: string;
  readonly aliases?: readonly string[];
  /** "○○은 …예요." 로 시작하는 한 문장 정의. DefinedTerm.description 으로도 쓰인다. */
  readonly definition: string;
  readonly detail?: readonly string[];
  readonly relatedFaqIds?: readonly string[];
  readonly updatedAt: string;
};

const U = '2026-09-27';

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  {
    id: 'regular-tournament',
    term: '정규 대회',
    definition: '정규 대회는 기간이 정해진 대회로, 토너먼트·조별+결선·리그 방식 가운데 하나로 진행돼요.',
    detail: ['참가 신청, 경기 운영, 결과 확정 절차는 정규 리그와 같아요.'],
    relatedFaqIds: ['regular-league-vs-tournament'],
    updatedAt: U,
  },
  {
    id: 'regular-league',
    term: '정규 리그',
    definition: '정규 리그는 시즌·티어·승강이 붙은 상시 리그예요.',
    detail: [
      '지난 시즌에서 승강으로 이어지는 팀은 다음 시즌에 자동으로 등록되고, 남는 자리는 참가 신청으로 채워요.',
    ],
    relatedFaqIds: ['regular-league-vs-tournament', 'league-promotion-entry'],
    updatedAt: U,
  },
  {
    id: 'league-format',
    term: '리그 방식 대회',
    definition: '리그 방식 대회는 기간이 정해진 정규 대회를 풀리그로 진행하는 방식이에요.',
    detail: ['이름이 비슷하지만 시즌·승강이 있는 정규 리그와는 다른 것이에요.'],
    relatedFaqIds: ['league-format-vs-regular-league'],
    updatedAt: U,
  },
  {
    id: 'promotion-relegation',
    term: '승강',
    definition: '승강은 정규 리그에서 시즌 성적에 따라 팀이 위아래 티어로 오르내리는 것이에요.',
    relatedFaqIds: ['league-promotion-entry'],
    updatedAt: U,
  },
  {
    id: 'team-match',
    term: '팀 매치',
    definition: '팀 매치는 팀과 팀이 맞붙는 경기예요.',
    detail: ['대회·리그를 통해 치르면 공식경기, 팀끼리 잡으면 친선경기가 돼요.'],
    updatedAt: U,
  },
  {
    id: 'official-match',
    term: '공식경기',
    aliases: ['공식 매치'],
    definition: '공식경기는 대회나 정규 리그를 통해 치르는 팀 매치예요.',
    detail: ['팀 전적의 대회·리그 칸에 쌓여요.'],
    relatedFaqIds: ['team-record-tabs'],
    updatedAt: U,
  },
  {
    id: 'friendly-match',
    term: '친선경기',
    aliases: ['친선 매치'],
    definition: '친선경기는 대회·리그를 거치지 않고 팀끼리 잡은 팀 매치예요.',
    detail: ['팀 전적의 친선 칸에 쌓여요.'],
    relatedFaqIds: ['team-record-tabs'],
    updatedAt: U,
  },
  {
    id: 'personal-match',
    term: '개인 매치',
    definition: '개인 매치는 호스트가 연 경기에 개인이 참가 신청을 보내 함께 뛰는 경기예요.',
    relatedFaqIds: ['match-confirmation', 'host-a-match'],
    updatedAt: U,
  },
  {
    id: 'roster',
    term: '명단',
    definition: '명단은 대회에 나가는 팀의 선수 목록으로, 등번호와 이름(닉네임)으로 등록해요.',
    detail: ['명단에 오른 선수가 곧 출전 선수예요. 선발·후보 구분은 없어요.'],
    relatedFaqIds: ['roster-means-played', 'edit-roster'],
    updatedAt: U,
  },
  {
    id: 'result-submission',
    term: '결과 보내기',
    aliases: ['결과 제출'],
    definition: '결과 보내기는 경기를 운영한 운영팀이 경기를 종료하는 순간 결과가 제출되는 단계예요.',
    detail: ['따로 누르는 버튼은 없고, 제출된 결과는 어드민이 확인할 때까지 ‘확정 전’으로 보여요.'],
    relatedFaqIds: ['result-confirmation'],
    updatedAt: U,
  },
  {
    id: 'pending-result',
    term: '확정 전',
    definition: '확정 전은 제출됐지만 어드민이 아직 확인하지 않은 결과에 붙는 표시예요.',
    detail: ['확정 전 결과는 순위·승점·전적에 들어가지 않아요.'],
    relatedFaqIds: ['result-confirmation'],
    updatedAt: U,
  },
  {
    id: 'result-confirmation',
    term: '결과 확정',
    definition: '결과 확정은 어드민이 제출된 결과를 확인해 공식 기록으로 만드는 한 단계예요.',
    detail: ['팀이 이의를 제기하는 절차는 없고, 잘못된 결과는 어드민이 고친 뒤 다시 확인해요.'],
    relatedFaqIds: ['result-confirmation', 'result-correction'],
    updatedAt: U,
  },
  {
    id: 'tournament-staff',
    term: '대회 스태프',
    definition: '대회 스태프는 팀밋이 대회마다 지정하는 운영 담당자예요.',
    detail: ['역할에 따라 경기 운영 화면에서 점수를 기록하거나 대회 운영을 도와요. 대회 개설 문의로 열린 대회는 주최 측 담당자를 대회 스태프로 지정해요.'],
    relatedFaqIds: ['host-a-competition'],
    updatedAt: U,
  },
  {
    id: 'live-score',
    term: '라이브 스코어',
    definition: '라이브 스코어는 경기 중 운영팀이 기록한 점수를 누구나 경기 상세에서 볼 수 있게 한 화면이에요.',
    relatedFaqIds: ['live-score'],
    updatedAt: U,
  },
  {
    id: 'mutual-review',
    term: '상호평가',
    definition: '상호평가는 경기가 끝난 뒤 함께 뛴 상대를 서로 평가하는 것이에요.',
    detail: ['받은 평가는 매너 점수로 쌓여요.'],
    relatedFaqIds: ['mutual-review'],
    updatedAt: U,
  },
  {
    id: 'player-card',
    term: '선수 카드',
    definition: '선수 카드는 내 경기 기록을 능력치와 등급으로 보여 주는 카드예요.',
    detail: ['등급은 실력이 아니라 출전한 경기 수로 올라가고, 카드는 숨길 수 있어요.'],
    relatedFaqIds: ['player-card-grade'],
    updatedAt: U,
  },
];

export const GLOSSARY_UPDATED_AT = GLOSSARY_TERMS.reduce((latest, term) => (term.updatedAt > latest ? term.updatedAt : latest), '');
