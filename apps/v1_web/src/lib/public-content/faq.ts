import type { AnswerParagraphs, PublicLink, PublicTable } from './types';

export type FaqCategoryId = 'account' | 'match' | 'team' | 'competition' | 'result' | 'fee' | 'support';

export type FaqCategory = {
  readonly id: FaqCategoryId;
  readonly label: string;
  readonly description: string;
};

export type FaqItem = {
  /** URL 앵커(`/faq#<id>`)로 쓰인다. 공개 뒤에 바꾸면 외부 링크·AI 인용이 깨진다. */
  readonly id: string;
  readonly category: FaqCategoryId;
  readonly question: string;
  readonly answer: AnswerParagraphs;
  readonly table?: PublicTable;
  readonly links?: readonly PublicLink[];
  readonly updatedAt: string;
};

export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  { id: 'account', label: '계정·가입', description: '가입 방법, 둘러보기 범위, 지원 종목, 계정 삭제' },
  { id: 'match', label: '매치', description: '개인 매치 신청·확정·취소와 매치 열기' },
  { id: 'team', label: '팀', description: '팀 만들기, 가입 신청, 팀장·매니저·멤버 역할' },
  { id: 'competition', label: '대회·리그', description: '대회·정규 리그 참가 신청과 명단, 대회 개설 문의' },
  { id: 'result', label: '결과·기록', description: '결과 확정, 라이브 스코어, 전적·상호평가·선수 카드' },
  { id: 'fee', label: '참가비·환불', description: '대회 참가비 납부와 환불 기준' },
  { id: 'support', label: '문의', description: '어떤 창구로 문의하면 되는지' },
];

const U = '2026-09-27';

const REFUND_TABLE: PublicTable = {
  caption: '대회 참가비 환불 기준',
  columns: ['상황', '환불'],
  rows: [
    { header: '대회 취소(주최 사정·천재지변 포함)', cells: ['전액 환불'] },
    { header: '대회 연기', cells: ['기존 대회일 2주 전까지 취소하면 환불, 그 뒤에는 제한될 수 있음'] },
    { header: '노쇼·허위 기재·대리 참가로 실격', cells: ['환불 불가'] },
    { header: '환불 처리 기간', cells: ['영업일 기준 3~7일'] },
  ],
};

const TEAM_ROLE_TABLE: PublicTable = {
  caption: '팀 역할별로 할 수 있는 일',
  columns: ['역할', '가입 신청 수락', '팀 매치 만들기', '대회 참가 신청'],
  rows: [
    { header: '팀장', cells: ['할 수 있어요', '할 수 있어요', '할 수 있어요'] },
    { header: '매니저', cells: ['할 수 있어요', '할 수 있어요', '할 수 있어요'] },
    { header: '멤버', cells: ['할 수 없어요', '할 수 없어요', '할 수 없어요'] },
  ],
};

export const FAQ_ITEMS: readonly FaqItem[] = [
  // ── 계정·가입
  {
    id: 'how-to-sign-up',
    category: 'account',
    question: '팀밋 가입은 어떻게 하나요?',
    answer: [
      '이메일과 비밀번호로 가입하거나, 카카오 계정으로 바로 시작할 수 있어요.',
      '둘러보기는 가입 직후부터 되고, 참가 신청·글쓰기 같은 활동은 휴대폰 본인인증을 마친 뒤에 할 수 있어요.',
    ],
    updatedAt: U,
  },
  {
    id: 'browse-without-account',
    category: 'account',
    question: '가입하지 않고도 둘러볼 수 있나요?',
    answer: [
      '네, 매치·팀·대회의 목록과 상세, 대진표와 경기 결과는 로그인 없이 볼 수 있어요.',
      '참가 신청, 팀 가입 신청, 1:1 문의는 로그인이 필요해요.',
    ],
    updatedAt: U,
  },
  {
    id: 'supported-sports',
    category: 'account',
    question: '어떤 종목을 지원하나요?',
    answer: [
      '매치와 팀은 축구·풋살·러닝·수영 네 종목을 지원해요.',
      '대회·정규 리그의 경기 설정은 축구와 풋살만 지원해요. 다른 종목으로 대회를 열고 싶다면 먼저 문의해 주세요.',
    ],
    links: [{ href: '/contact#hosting', label: '대회 개설 문의하기' }],
    updatedAt: U,
  },
  {
    id: 'install-app',
    category: 'account',
    question: '앱은 어떻게 설치하나요?',
    answer: [
      '팀밋은 브라우저에서 바로 쓸 수 있고, 브라우저 메뉴의 ‘홈 화면에 추가’를 쓰면 앱처럼 열려요.',
    ],
    updatedAt: U,
  },
  {
    id: 'delete-account',
    category: 'account',
    question: '계정은 어떻게 삭제하나요?',
    answer: [
      '로그인할 수 있다면 설정의 회원 탈퇴 화면에서 직접 요청할 수 있어요.',
      '로그인할 수 없다면 계정 삭제 안내 페이지에 적힌 이메일로 요청해 주세요.',
    ],
    links: [{ href: '/account-deletion', label: '계정 삭제 안내 보기' }],
    updatedAt: U,
  },
  // ── 매치
  {
    id: 'match-confirmation',
    category: 'match',
    question: '매치 참가는 언제 확정되나요?',
    answer: [
      '참가 신청을 보내고, 매치를 연 호스트가 승인하면 참가가 확정돼요.',
      '신청 상태는 매치 상세에서 확인할 수 있어요.',
    ],
    links: [{ href: '/help/guides/join-match', label: '매치 참가 가이드' }],
    updatedAt: U,
  },
  {
    id: 'match-cancel-application',
    category: 'match',
    question: '보낸 참가 신청을 취소할 수 있나요?',
    answer: ['네, 매치 상세에서 ‘신청 취소’를 누르면 보낸 신청을 거둘 수 있어요.'],
    updatedAt: U,
  },
  {
    id: 'match-chat',
    category: 'match',
    question: '참가가 확정되면 다른 참가자와 어떻게 연락하나요?',
    answer: [
      '호스트가 참가를 승인하면 매치 상세의 채팅으로 호스트·참가자와 바로 이야기할 수 있어요.',
      '승인 전에는 채팅 버튼이 ‘승인 후 채팅’으로 보여요.',
    ],
    updatedAt: U,
  },
  {
    id: 'host-a-match',
    category: 'match',
    question: '매치를 직접 열 수 있나요?',
    answer: [
      '네, 휴대폰 본인인증을 마치고 프로필에 실명·휴대폰 번호·성별을 채우면 누구나 매치를 열 수 있어요.',
      '매치를 연 사람이 호스트가 되고, 들어온 참가 신청을 직접 승인해요.',
    ],
    updatedAt: U,
  },
  // ── 팀
  {
    id: 'join-a-team',
    category: 'team',
    question: '팀에 들어가려면 어떻게 하나요?',
    answer: [
      '팀 상세에서 가입 신청을 보내고, 팀장이나 매니저가 수락하면 멤버가 돼요.',
      '팀이 모집을 닫아 두었다면 신청할 수 없어요.',
    ],
    updatedAt: U,
  },
  {
    id: 'create-a-team',
    category: 'team',
    question: '팀은 어떻게 만드나요?',
    answer: [
      '휴대폰 본인인증을 마치고 프로필에 실명·휴대폰 번호·성별을 채우면 누구나 팀을 만들 수 있고, 팀 만들기는 현재 무료예요.',
      '팀을 만든 사람이 팀장이 돼요.',
    ],
    links: [{ href: '/help/guides/create-team', label: '팀 만들고 운영하기 가이드' }],
    updatedAt: U,
  },
  {
    id: 'team-roles',
    category: 'team',
    question: '팀장·매니저·멤버는 무엇이 다른가요?',
    answer: [
      '팀장과 매니저는 가입 신청 수락·팀 매치 만들기·대회 참가 신청처럼 팀을 관리하고, 멤버는 팀 활동에 참여해요.',
      '매니저는 한 팀에 최대 5명까지 둘 수 있어요.',
    ],
    table: TEAM_ROLE_TABLE,
    updatedAt: U,
  },
  {
    id: 'transfer-team-owner',
    category: 'team',
    question: '팀장을 다른 사람에게 넘길 수 있나요?',
    answer: [
      '네, 팀장은 매니저에게 팀장을 넘길 수 있고, 넘긴 사람은 매니저가 돼요.',
      '멤버에게 넘기려면 먼저 그 멤버를 매니저로 바꿔 주세요.',
    ],
    updatedAt: U,
  },
  // ── 대회·리그
  {
    id: 'join-a-competition',
    category: 'competition',
    question: '대회에 참가하려면 어떻게 하나요?',
    answer: [
      '팀장이나 매니저가 대회 상세에서 참가 신청과 함께 명단(등번호·이름)을 등록하고, 대회 운영자가 확정하면 참가가 확정돼요.',
      '유료 대회라면 참가 신청을 마친 뒤 결제 안내 화면이나 대회 상세의 \'내 신청\'에서 입금 계좌를 확인하고 참가비를 보내요.',
    ],
    links: [{ href: '/help/guides/join-competition', label: '대회·리그 참가 가이드' }],
    updatedAt: U,
  },
  {
    id: 'member-cannot-apply',
    category: 'competition',
    question: '멤버도 대회 참가 신청을 할 수 있나요?',
    answer: [
      '아니요, 대회 참가 신청은 팀장이나 매니저가 팀 이름으로 보내요.',
      '멤버라면 팀장·매니저에게 신청을 부탁하고, 명단에 오를 등번호와 이름을 알려 주세요.',
    ],
    updatedAt: U,
  },
  {
    id: 'regular-league-vs-tournament',
    category: 'competition',
    question: '정규 리그와 정규 대회는 무엇이 다른가요?',
    answer: [
      '정규 대회는 기간이 정해진 대회(토너먼트, 조별+결선, 리그 방식 등)이고, 정규 리그는 시즌·티어·승강이 붙은 상시 리그예요.',
      '둘 다 같은 참가 신청, 같은 경기 운영, 같은 결과 확정 절차를 써요.',
    ],
    links: [{ href: '/help/glossary', label: '용어집 보기' }],
    updatedAt: U,
  },
  {
    id: 'league-format-vs-regular-league',
    category: 'competition',
    question: '정규 리그와 ‘리그 방식 대회’는 같은 건가요?',
    answer: [
      '아니요, 리그 방식 대회는 기간이 정해진 정규 대회를 풀리그로 진행하는 방식이고, 정규 리그는 시즌·티어·승강이 있는 상시 리그예요.',
      '참가 절차와 결과 확정 방식은 같아요.',
    ],
    updatedAt: U,
  },
  {
    id: 'league-promotion-entry',
    category: 'competition',
    question: '정규 리그에서 승강한 팀은 다음 시즌에 다시 신청해야 하나요?',
    answer: [
      '아니요, 지난 시즌에서 승강으로 이어지는 팀은 다음 시즌에 자동으로 등록돼요.',
      '남는 자리는 참가 신청으로 채우고, 정원을 넘으면 운영자가 사유와 함께 조정해요.',
    ],
    updatedAt: U,
  },
  {
    id: 'edit-roster',
    category: 'competition',
    question: '신청한 뒤에 명단을 바꿀 수 있나요?',
    answer: [
      '네, 대회가 정한 명단 마감 전이라면 팀장·매니저가 신청한 대회의 명단에서 등번호와 선수를 고칠 수 있어요.',
      '명단 마감은 대회마다 달라요.',
    ],
    updatedAt: U,
  },
  {
    id: 'roster-means-played',
    category: 'competition',
    question: '명단에 오른 선수는 모두 출전한 것으로 기록되나요?',
    answer: [
      '네, 대회 명단에 오른 선수가 곧 그 대회의 출전 선수예요.',
      '선발·후보 구분은 없고, 경기마다 따로 출전을 확정하는 단계도 없어요.',
    ],
    updatedAt: U,
  },
  {
    id: 'host-a-competition',
    category: 'competition',
    question: '팀밋에서 직접 대회를 열 수 있나요?',
    answer: [
      '지금은 누구나 바로 대회를 여는 기능은 없고, 대회 개설·제휴 문의를 남기면 팀밋 운영팀이 검토한 뒤 개설을 도와요.',
      '대회가 열리면 주최 측 담당자를 대회 스태프로 지정해 드려요. 대회 경기 설정은 축구와 풋살을 지원해요.',
    ],
    links: [
      { href: '/for/organizers', label: '대회 운영자 안내' },
      { href: '/contact#hosting', label: '대회 개설 문의하기' },
    ],
    updatedAt: U,
  },
  // ── 결과·기록
  {
    id: 'result-confirmation',
    category: 'result',
    question: '경기 결과는 어떻게 확정되나요?',
    answer: [
      '경기를 운영한 운영팀이 경기를 종료하면 결과가 제출되고, 어드민이 확인하면 확정돼요.',
      '확인 전까지는 점수 옆에 ‘확정 전’이 붙고, 순위·승점·전적에는 확정된 결과만 반영돼요. 대회 설정에 따라 확정 전 점수를 보여 주지 않는 대회도 있어요.',
    ],
    links: [{ href: '/help/guides/match-results', label: '경기 결과 확정 가이드' }],
    updatedAt: U,
  },
  {
    id: 'result-correction',
    category: 'result',
    question: '결과가 잘못 기록됐어요. 이의를 제기할 수 있나요?',
    answer: [
      '팀이 이의를 제기하는 별도 절차는 없고, 대회 운영자나 팀밋에 알려 주시면 어드민이 결과를 고친 뒤 다시 확인해요.',
      '참가팀은 결과를 직접 입력하거나 고칠 수 없어요.',
    ],
    links: [{ href: '/contact', label: '문의 창구 보기' }],
    updatedAt: U,
  },
  {
    id: 'live-score',
    category: 'result',
    question: '대회 경기 점수는 어디서 보나요?',
    answer: [
      '대회 경기 상세에서 라이브 스코어로 볼 수 있고, 로그인하지 않아도 열려요.',
      '경기가 진행되는 동안 화면이 새 점수를 자동으로 불러와요. 대회 설정에 따라 점수를 공개하지 않는 경기도 있어요.',
    ],
    updatedAt: U,
  },
  {
    id: 'team-record-tabs',
    category: 'result',
    question: '팀 전적은 어떻게 나뉘나요?',
    answer: [
      '팀 전적은 전체·대회·리그·친선 네 갈래로 나뉘어 쌓여요.',
      '대회나 정규 리그를 통해 치른 공식경기는 대회·리그에, 그 밖의 팀 매치는 친선에 들어가요. 개인 기록도 같은 기준으로 나뉘어요.',
    ],
    updatedAt: U,
  },
  {
    id: 'mutual-review',
    category: 'result',
    question: '상호평가는 무엇인가요?',
    answer: [
      '상호평가는 경기가 끝난 뒤 함께 뛴 상대를 평가하는 것이고, 받은 평가는 매너 점수로 쌓여요.',
    ],
    updatedAt: U,
  },
  {
    id: 'player-card-grade',
    category: 'result',
    question: '선수 카드 등급은 어떻게 올라가나요?',
    answer: [
      '선수 카드 등급은 실력이 아니라 출전한 경기 수로 올라가요.',
      '카드를 다른 사람에게 보이고 싶지 않다면 숨길 수 있어요.',
    ],
    updatedAt: U,
  },
  // ── 참가비·환불
  {
    id: 'entry-fee-payment',
    category: 'fee',
    question: '대회 참가비는 어떻게 내나요?',
    answer: [
      '대회 참가비는 대회마다 주최 측이 정해요.',
      '유료 대회는 참가 신청을 마치면 결제 안내 화면과 대회 상세의 \'내 신청\'에서 입금 계좌를 확인할 수 있어요.',
      '무료 대회는 참가비 단계가 없어요.',
    ],
    updatedAt: U,
  },
  {
    id: 'entry-fee-refund',
    category: 'fee',
    question: '대회 참가비는 환불되나요?',
    answer: [
      '대회가 취소되면 참가비는 전액 환불돼요.',
      '대회가 연기되면 기존 대회일 2주 전까지 취소할 때 환불되고, 노쇼·허위·대리 참가로 실격되면 환불되지 않아요. 환불은 영업일 3~7일 안에 처리되고, 대회마다 따로 안내한 규정이 있으면 그 안내가 먼저예요.',
    ],
    table: REFUND_TABLE,
    links: [{ href: '/terms?document=tournament-policy', label: '대회 운영정책 보기' }],
    updatedAt: U,
  },
  // ── 문의
  {
    id: 'where-to-ask',
    category: 'support',
    question: '문의는 어디로 하나요?',
    answer: [
      '로그인했다면 1:1 문의를 쓰면 되고, 답변은 마이페이지의 문의 화면에서 확인할 수 있어요.',
      '로그인이 안 될 때는 이메일로, 대회 개설·제휴는 문의 페이지의 문의 폼으로 보내 주세요.',
    ],
    links: [{ href: '/contact', label: '문의 창구 보기' }],
    updatedAt: U,
  },
];

export const FAQ_UPDATED_AT = FAQ_ITEMS.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), '');

export function faqById(id: string): FaqItem | undefined {
  return FAQ_ITEMS.find((item) => item.id === id);
}

/** 가이드·대상 페이지의 관련 질문 목록. 없는 id 는 콘텐츠 오타라 조용히 빼지 않고 던진다. */
export function faqsByIds(ids: readonly string[]): FaqItem[] {
  return ids.map((id) => {
    const item = faqById(id);
    if (!item) throw new Error(`Unknown FAQ id: ${id}`);
    return item;
  });
}
