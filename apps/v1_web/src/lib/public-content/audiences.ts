import type { GuideSlug } from './guides';
import type { PublicLink, PublicTable } from './types';

export type AudienceSlug = 'players' | 'teams' | 'organizers';

export type AudiencePoint = {
  readonly title: string;
  readonly body: string;
};

/** 섹션 머리(키워드 → 제목 → 본문). landing-rhythm 모듈과 같은 순서다. */
export type AudienceSectionHead = {
  readonly keyword: string;
  readonly title: string;
  readonly lead?: string;
};

export type AudiencePage = {
  readonly slug: AudienceSlug;
  readonly path: `/for/${AudienceSlug}`;
  /** 헤더 "이용 대상" 메뉴·푸터에 쓰는 짧은 이름. */
  readonly navLabel: string;
  /** WebPage JSON-LD 의 audience.audienceType. */
  readonly audienceType: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly keyword: string;
  readonly title: string;
  readonly lead: string;
  /** 히어로 아래 사실 줄. 수치·기간 약속 없이 코드로 확인되는 값만 둔다. */
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  /** 주요 CTA 앞에서 먼저 알아야 할 전제 한 줄. */
  readonly heroNote?: string;
  readonly pointsHead: AudienceSectionHead;
  readonly points: readonly AudiencePoint[];
  /** 역할·권한 표. 표의 칸은 서버 가드와 1:1 이어야 한다. */
  readonly roleTable?: AudienceSectionHead & { readonly table: PublicTable; readonly note?: string };
  readonly stepsHead: AudienceSectionHead;
  readonly steps: readonly AudiencePoint[];
  /** "아직 지원하지 않는 것" 정직 고지. alpha 에 없는 기능을 약속하지 않기 위한 경계다. */
  readonly notYet: readonly AudiencePoint[];
  /** 첫 항목이 주요 CTA 다. */
  readonly ctas: readonly [PublicLink, ...PublicLink[]];
  readonly relatedFaqIds: readonly string[];
  readonly relatedGuideSlug: GuideSlug;
  readonly updatedAt: string;
};

const U = '2026-09-27';

const PLAYERS: AudiencePage = {
  slug: 'players',
  path: '/for/players',
  navLabel: '개인',
  audienceType: '개인 참가자',
  metaTitle: '개인 참가자 안내',
  metaDescription:
    '축구·풋살·러닝·수영 매치를 찾아 신청하고, 호스트가 승인하면 참가가 확정돼요. 경기 뒤에는 상호평가로 매너 점수가 쌓여요.',
  keyword: '개인으로 뛰고 싶다면',
  title: '혼자여도 이번 주 경기에 나갈 수 있어요',
  lead: '매치를 찾아 신청하고, 호스트가 승인하면 참가가 확정돼요. 경기 뒤에는 상호평가로 매너 점수가 쌓여요.',
  facts: [
    { label: '매치 종목', value: '축구·풋살·러닝·수영' },
    { label: '참가 확정', value: '호스트 승인' },
    { label: '둘러보기', value: '로그인 없이' },
  ],
  pointsHead: { keyword: '할 수 있는 것', title: '찾고, 신청하고, 기록을 남겨요' },
  points: [
    { title: '둘러보기는 가입 없이', body: '매치·팀·대회 목록과 상세는 로그인하지 않아도 볼 수 있어요.' },
    { title: '신청하고 승인받기', body: '매치 상세에서 참가 신청을 보내고, 호스트가 승인하면 참가가 확정돼요.' },
    { title: '확정되면 채팅으로', body: '참가가 승인되면 매치 채팅으로 호스트·참가자와 바로 이야기해요.' },
    { title: '기록과 선수 카드', body: '팀으로 경기에 출전하면 기록이 쌓이고, 출전한 경기 수만큼 선수 카드 등급이 올라가요.' },
    { title: '팀으로 이어가기', body: '마음에 맞는 팀을 찾으면 팀 상세에서 가입 신청을 보내요.' },
  ],
  stepsHead: { keyword: '시작하는 방법', title: '첫 매치까지 세 단계예요' },
  steps: [
    { title: '매치 찾기', body: '매치 목록에서 종목과 지역으로 좁혀 모집 중인 매치를 찾아요.' },
    { title: '참가 신청', body: '로그인하고 매치 상세에서 신청을 보내면, 호스트가 승인할 때 참가가 확정돼요.' },
    { title: '경기 뒤 상호평가', body: '경기가 끝나면 함께 뛴 사람을 평가하고, 받은 평가는 매너 점수로 쌓여요.' },
  ],
  notYet: [
    { title: '앱 안 결제', body: '매치 참가비는 앱에서 결제하지 않아요. 참가비가 있으면 호스트가 매치 상세에 적어 둬요.' },
    {
      title: '맞춤 추천',
      body: '가입할 때 고른 종목·지역에 맞춰 매치를 골라 주는 기능은 아직 없어요. 홈의 추천 매치는 곧 시작하는 모집 중 매치예요.',
    },
  ],
  ctas: [
    { href: '/matches', label: '매치 둘러보기' },
    { href: '/login', label: '시작하기' },
  ],
  relatedFaqIds: ['browse-without-account', 'match-confirmation', 'match-cancel-application', 'mutual-review', 'player-card-grade'],
  relatedGuideSlug: 'join-match',
  updatedAt: U,
};

const TEAMS: AudiencePage = {
  slug: 'teams',
  path: '/for/teams',
  navLabel: '팀',
  audienceType: '팀장·팀 운영진',
  metaTitle: '팀 운영 안내',
  metaDescription:
    '팀을 만들고 가입 신청을 받아 멤버를 모으고, 매니저와 함께 팀 매치·대회 참가 신청까지 이어서 해요. 팀 만들기는 현재 무료예요.',
  keyword: '팀을 꾸리고 있다면',
  title: '멤버 모집부터 대회 신청까지, 팀 운영을 한곳에서',
  lead: '가입 신청을 받아 멤버를 모으고, 매니저와 함께 팀 매치와 대회 신청까지 이어서 해요. 팀 만들기는 현재 무료예요.',
  facts: [
    { label: '팀 역할', value: '팀장·매니저·멤버' },
    { label: '경기', value: '친선 팀 매치·대회·리그' },
    { label: '팀 만들기', value: '현재 무료' },
  ],
  heroNote: '팀을 만들려면 로그인한 뒤 프로필에 실명·휴대폰 번호·성별을 채워 주세요.',
  pointsHead: { keyword: '팀장이 하는 일', title: '공지방에서 하나씩 챙기던 일을 한곳에서 해요' },
  points: [
    { title: '팀 만들기', body: '팀 이름·종목·활동 지역을 정해 팀을 만들면 만든 사람이 팀장이 돼요.' },
    { title: '가입 신청과 초대', body: '들어온 가입 신청을 팀장·매니저가 수락하면 멤버가 돼요. 함께할 사람을 직접 초대할 수도 있고, 가입 신청을 닫아 둘 수도 있어요.' },
    { title: '역할 나누기', body: '매니저를 최대 5명까지 두고 신청 수락과 팀 매치 만들기를 함께 맡겨요.' },
    { title: '팀 매치와 대회', body: '다른 팀과 친선 팀 매치를 잡거나, 등번호·이름 명단으로 대회에 참가 신청을 보내요.' },
    { title: '팀 일정', body: '훈련 일정을 팀 일정에 올리고 멤버에게만 보이게 둘 수 있어요. 팀 매치가 잡히면 경기 일정은 자동으로 올라가요.' },
    { title: '전적이 쌓이는 팀', body: '팀 전적이 전체·대회·리그·친선으로 나뉘어 쌓여요.' },
  ],
  roleTable: {
    keyword: '역할과 권한',
    title: '혼자 다 하지 않아도 돼요',
    lead: '팀 역할은 팀장·매니저·멤버 세 가지예요. 매니저를 두면 가입 신청 처리와 경기 준비를 나눠 맡을 수 있어요.',
    table: {
      caption: '팀 역할별로 할 수 있는 일',
      columns: ['할 수 있는 일', '팀장', '매니저', '멤버'],
      rows: [
        { header: '팀 정보·가입 설정 바꾸기', cells: ['가능', '가능', '불가'] },
        { header: '가입 신청 수락·거절, 초대', cells: ['가능', '가능', '불가'] },
        { header: '팀 매치 만들기', cells: ['가능', '가능', '불가'] },
        { header: '대회 참가 신청', cells: ['가능', '가능', '불가'] },
        { header: '팀 일정 올리기·고치기', cells: ['가능', '가능', '불가'] },
        { header: '역할 바꾸기·내보내기', cells: ['가능', '멤버만', '불가'] },
        { header: '팀장 넘기기', cells: ['매니저에게만', '불가', '불가'] },
        { header: '멤버에게만 공개한 일정 보기', cells: ['가능', '가능', '가능'] },
      ],
    },
    note: '매니저는 한 팀에 최대 5명까지 둘 수 있어요. 팀장을 넘기면 기존 팀장은 매니저가 돼요.',
  },
  stepsHead: { keyword: '시작하는 방법', title: '팀은 세 단계면 꾸려져요' },
  steps: [
    { title: '팀 만들기', body: '팀 이름·종목·활동 지역을 정하고, 가입 신청을 받을지 골라요.' },
    { title: '멤버 모으기', body: '함께할 사람을 초대하거나 들어온 가입 신청을 수락해요. 역할과 등번호는 나중에 바꿀 수 있어요.' },
    { title: '첫 경기 잡기', body: '팀 매치를 올려 친선 경기 상대를 찾거나, 열려 있는 대회·리그에 참가를 신청해요.' },
  ],
  notYet: [
    { title: '경기 결과 입력', body: '대회·리그 경기 결과는 참가팀이 입력하지 않고, 대회 운영팀이 기록해요.' },
    { title: '팀장 넘기기 범위', body: '팀장은 매니저에게만 넘길 수 있어요. 멤버에게 넘기려면 먼저 매니저로 바꿔 주세요.' },
  ],
  ctas: [
    { href: '/teams/new', label: '팀 만들기' },
    { href: '/teams', label: '팀 둘러보기' },
  ],
  relatedFaqIds: ['create-a-team', 'join-a-team', 'team-roles', 'transfer-team-owner', 'join-a-competition'],
  relatedGuideSlug: 'create-team',
  updatedAt: U,
};

/*
 * 주최 측에게는 "대회 스태프 지정"까지만 약속한다. 대회 생성·설정 변경은 플랫폼 어드민(owner/ops)만
 * 할 수 있고 대회 단위로 좁힌 어드민 권한이 없어서, 그 이상을 약속하면 전체 어드민을 넘겨야 한다.
 */
const ORGANIZERS: AudiencePage = {
  slug: 'organizers',
  path: '/for/organizers',
  navLabel: '대회 운영자',
  audienceType: '대회·리그 주최 단체',
  metaTitle: '대회 운영자 안내',
  metaDescription:
    '참가 신청·명단·대진·라이브 스코어·결과 확정을 한 흐름으로 이어 주는 생활체육 대회 운영. 지금은 문의를 남기면 팀밋 운영팀이 대회 개설을 함께 도와요.',
  keyword: '대회를 열고 싶다면',
  title: '신청부터 결과 확정까지, 대회 운영을 한 흐름으로',
  lead: '참가 신청·명단·대진·라이브 스코어·결과 확정이 한 흐름으로 이어져요. 지금은 문의를 남기면 팀밋 운영팀이 대회 개설을 함께 도와요.',
  facts: [
    { label: '진행 방식', value: '토너먼트·조별+결선·리그' },
    { label: '경기 설정 종목', value: '축구·풋살' },
    { label: '시작 방법', value: '도입 문의' },
  ],
  heroNote: '대회는 문의 후 팀밋 운영팀과 함께 개설해요. 주최 측이 직접 개설하는 화면은 아직 없어요.',
  pointsHead: {
    keyword: '운영 흐름',
    title: '대회 하나를 여는 데 필요한 일이 순서대로 이어져요',
    lead: '참가 신청을 받는 순간부터 결과가 공개되는 순간까지 같은 서비스 안에서 이어서 운영해요.',
  },
  points: [
    { title: '참가 신청과 확정', body: '팀장·매니저가 팀 단위로 신청하고 운영자가 확정해요. 정원이 넘치면 운영자가 사유와 함께 조정해요.' },
    { title: '등번호 명단', body: '신청할 때 선수를 등번호와 이름으로 올려요. 명단에 있는 선수가 곧 출전 선수예요.' },
    { title: '대진과 일정', body: '토너먼트·조별+결선·리그 방식을 지원하고, 대진표와 경기 일정을 공개해요.' },
    { title: '경기 기록과 라이브 스코어', body: '대회 스태프가 경기 운영 화면에서 점수를 기록하면 관전자는 경기 상세에서 라이브 스코어로 봐요.' },
    { title: '결과 확인은 한 단계', body: '경기를 종료하면 결과가 제출되고, 어드민이 확인하면 확정돼요.' },
    { title: '결과·시상 공개', body: '확정된 결과는 대회 결과·시상 페이지로 누구나 볼 수 있고, 팀 전적과 개인 기록에 남아요.' },
  ],
  roleTable: {
    keyword: '운영 조직',
    title: '현장 인원마다 맡는 일을 나눠요',
    lead: '대회마다 스태프를 지정하고 역할별로 권한을 나눠요. 한 사람이 모든 경기를 붙잡고 있지 않아도 돼요.',
    table: {
      caption: '대회 스태프 역할과 맡는 일',
      columns: ['역할', '맡는 일', '점수 기록'],
      rows: [
        { header: '대회 총괄', cells: ['대회의 모든 경기를 운영하고 기록해요', '가능'] },
        { header: '필드 담당', cells: ['배정된 경기장이나 경기를 운영하고 기록해요', '배정된 경기만'] },
        { header: '조회 전용', cells: ['운영 화면을 함께 보며 현장을 도와요', '볼 수만 있어요'] },
      ],
    },
    note: '스태프로 지정할 분은 팀밋 계정이 있어야 해요.',
  },
  stepsHead: {
    keyword: '시작하는 방법',
    title: '대회 개설은 이렇게 시작해요',
    lead: '팀밋의 대회는 운영팀이 주최 측과 함께 개설해요.',
  },
  steps: [
    { title: '도입 문의 남기기', body: '문의 페이지에서 단체 이름·종목·희망 시기와 대회 내용을 남겨 주세요. 로그인하지 않아도 보낼 수 있어요.' },
    { title: '운영팀과 대회 구성 정리', body: '진행 방식·참가 정원·참가비 입금 계좌·일정을 함께 정해요.' },
    { title: '대회 공개와 스태프 지정', body: '팀밋 운영팀이 대회를 열어 참가 신청을 받고, 경기 운영을 맡을 분을 대회 스태프로 지정해 드려요.' },
  ],
  notYet: [
    { title: '직접 대회 개설', body: '주최 측이 혼자 대회를 만드는 화면은 아직 없어요. 개설은 문의로 시작해요.' },
    { title: '카드 결제·자동 정산', body: '참가비는 대회에 등록한 계좌로 이체하도록 안내하고, 입금을 확인해 처리해요.' },
    { title: '결과 이의 신청', body: '결과는 확인 한 단계로 확정돼요. 정정이 필요하면 운영자에게 알려 주세요.' },
    { title: '축구·풋살 외 종목 대회', body: '대회 경기 설정은 축구와 풋살만 지원해요.' },
    { title: '대회 설정 직접 변경', body: '일정·참가비·진행 방식 같은 대회 설정은 팀밋 운영팀이 반영해요.' },
  ],
  ctas: [
    { href: '/contact#hosting', label: '도입 문의하기' },
    { href: '/tournaments', label: '대회 둘러보기' },
  ],
  relatedFaqIds: ['host-a-competition', 'regular-league-vs-tournament', 'entry-fee-payment', 'entry-fee-refund', 'result-confirmation', 'result-correction'],
  relatedGuideSlug: 'match-results',
  updatedAt: U,
};

export const AUDIENCE_PAGES: readonly AudiencePage[] = [PLAYERS, TEAMS, ORGANIZERS];

export function audienceBySlug(slug: AudienceSlug): AudiencePage {
  const page = AUDIENCE_PAGES.find((item) => item.slug === slug);
  if (!page) throw new Error(`Unknown audience: ${slug}`);
  return page;
}
