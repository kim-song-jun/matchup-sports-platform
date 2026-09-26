import type { AnswerParagraphs } from './types';

export type GuideSlug = 'join-match' | 'create-team' | 'join-competition' | 'match-results';

export type GuideStep = {
  readonly title: string;
  readonly body: string;
};

export type GuideNote = {
  readonly title: string;
  readonly body: AnswerParagraphs;
};

export type Guide = {
  readonly slug: GuideSlug;
  readonly title: string;
  /** 페이지 맨 위 답 상자이자 meta description. 첫 문장만으로 전체 흐름이 읽혀야 한다. */
  readonly summary: string;
  readonly audience: string;
  readonly steps: readonly GuideStep[];
  readonly notes: readonly GuideNote[];
  readonly relatedFaqIds: readonly string[];
  readonly updatedAt: string;
};

const U = '2026-09-27';

export const GUIDES: readonly Guide[] = [
  {
    slug: 'join-match',
    title: '개인 매치에 참가하는 방법',
    summary: '매치 목록에서 매치를 찾아 참가 신청을 보내고, 매치를 연 호스트가 승인하면 참가가 확정돼요.',
    audience: '개인으로 뛰고 싶은 분',
    steps: [
      {
        title: '매치를 찾아요',
        body: '매치 목록에서 종목과 지역으로 좁혀 보고, 매치 상세에서 장소·시간·모집 인원·참가 조건을 확인해요. 로그인하지 않아도 볼 수 있어요.',
      },
      {
        title: '참가 신청을 보내요',
        body: '매치 상세에서 참가 신청을 눌러요. 신청하려면 로그인과 휴대폰 본인인증이 필요해요.',
      },
      {
        title: '호스트가 승인하면 확정돼요',
        body: '매치를 연 호스트가 신청을 승인하면 참가가 확정돼요. 신청을 거두고 싶다면 매치 상세의 ‘신청 취소’를 눌러요.',
      },
      {
        title: '채팅으로 이야기해요',
        body: '참가가 승인되면 매치 상세의 채팅으로 호스트·참가자와 이야기할 수 있어요.',
      },
      {
        title: '경기 뒤에 상호평가를 남겨요',
        body: '경기가 끝나면 함께 뛴 상대를 평가할 수 있고, 받은 평가는 매너 점수로 쌓여요.',
      },
    ],
    notes: [
      {
        title: '매치를 직접 열고 싶다면',
        body: ['프로필에 실명·휴대폰 번호·성별을 채우면 누구나 매치를 열 수 있고, 들어온 신청은 호스트인 내가 승인해요.'],
      },
    ],
    relatedFaqIds: ['match-confirmation', 'match-cancel-application', 'match-chat', 'host-a-match'],
    updatedAt: U,
  },
  {
    slug: 'create-team',
    title: '팀을 만들고 운영하는 방법',
    summary: '프로필을 채운 계정으로 팀을 만들면 팀장이 되고, 가입 신청을 수락해 멤버를 받고, 매니저를 두어 함께 운영해요.',
    audience: '팀을 꾸리고 싶은 분',
    steps: [
      {
        title: '프로필을 채워요',
        body: '휴대폰 본인인증을 마치고 프로필에 실명·휴대폰 번호·성별을 채워요. 이 세 가지가 있어야 팀을 만들 수 있어요.',
      },
      {
        title: '팀을 만들어요',
        body: '팀 이름과 종목 같은 기본 정보를 적어 팀을 만들면, 만든 사람이 팀장이 돼요. 팀 만들기는 현재 무료예요.',
      },
      {
        title: '가입 신청을 받아요',
        body: '팀 상세로 들어온 가입 신청을 팀장이나 매니저가 수락하면 멤버가 돼요. 모집을 닫아 두면 새 신청을 받지 않아요.',
      },
      {
        title: '매니저를 정해요',
        body: '멤버를 매니저로 바꾸면 가입 신청 수락과 팀 매치 만들기를 함께 맡길 수 있어요. 매니저는 최대 5명까지 둘 수 있어요.',
      },
      {
        title: '팀 매치와 대회로 넓혀요',
        body: '팀장·매니저는 다른 팀과 친선 팀 매치를 만들거나, 대회에 참가 신청을 보낼 수 있어요.',
      },
    ],
    notes: [
      {
        title: '팀장을 넘기고 싶다면',
        body: ['팀장은 매니저에게만 넘길 수 있고, 넘긴 사람은 매니저가 돼요.'],
      },
    ],
    relatedFaqIds: ['create-a-team', 'join-a-team', 'team-roles', 'transfer-team-owner'],
    updatedAt: U,
  },
  {
    slug: 'join-competition',
    title: '대회·리그에 참가하는 방법',
    summary: '팀장이나 매니저가 대회 상세에서 참가 신청과 명단(등번호·이름)을 보내고, 유료 대회라면 참가비를 이체한 뒤, 대회 운영자가 확정하면 참가가 끝나요.',
    audience: '팀장·매니저',
    steps: [
      {
        title: '참가할 대회를 골라요',
        body: '대회 목록에서 종목과 종류(정규 대회·정규 리그)로 좁혀 보고, 대회 상세에서 일정·장소·참가비·신청 마감을 확인해요.',
      },
      {
        title: '팀장이나 매니저가 참가 신청을 보내요',
        body: '대회 상세에서 참가 신청을 누르고 신청할 팀을 골라요. 팀장·매니저만 팀 이름으로 신청할 수 있어요.',
      },
      {
        title: '명단을 등번호와 이름으로 등록해요',
        body: '명단에 오른 선수가 곧 그 대회의 출전 선수예요. 선발·후보 구분은 없고, 경기마다 따로 출전을 확정하는 단계도 없어요.',
      },
      {
        title: '유료 대회라면 참가비를 이체해요',
        body: '참가비는 대회마다 주최 측이 정해요. 입금 계좌는 참가 신청을 마치면 결제 안내 화면과 대회 상세의 \'내 신청\'에서 확인할 수 있어요. 무료 대회는 이 단계가 없어요.',
      },
      {
        title: '대회 운영자가 참가를 확정해요',
        body: '운영자가 신청을 확인하면 참가가 확정돼요.',
      },
    ],
    notes: [
      {
        title: '정규 리그는 한 가지가 달라요',
        body: [
          '지난 시즌에서 승강으로 이어지는 팀은 자동으로 등록되고, 남는 자리를 참가 신청으로 채워요.',
          '정원을 넘으면 운영자가 사유와 함께 조정해요.',
        ],
      },
      {
        title: '취소와 환불',
        body: [
          '대회가 취소되면 참가비는 전액 환불되고, 환불은 영업일 기준 3~7일 안에 처리돼요.',
          '대회마다 따로 안내한 규정이 있으면 그 안내가 먼저예요.',
        ],
      },
    ],
    relatedFaqIds: ['join-a-competition', 'member-cannot-apply', 'edit-roster', 'roster-means-played', 'entry-fee-refund'],
    updatedAt: U,
  },
  {
    slug: 'match-results',
    title: '대회 경기 결과가 확정되는 과정',
    summary: '경기를 운영한 운영팀이 경기를 종료하면 결과가 제출돼 ‘확정 전’으로 보이고, 어드민이 확인하면 확정돼 순위·승점·전적에 반영돼요.',
    audience: '대회 참가팀과 관전자',
    steps: [
      {
        title: '운영팀이 경기를 기록해요',
        body: '대회 스태프로 지정된 운영팀이 경기 운영 화면에서 점수를 기록하고, 관전자는 경기 상세의 라이브 스코어로 봐요.',
      },
      {
        title: '경기가 끝나면 결과가 제출돼요',
        body: '운영팀이 경기를 종료하면 결과가 바로 제출되고, 점수 옆에 ‘확정 전’이 붙어요. 결과를 따로 보내는 단계는 없어요.',
      },
      {
        title: '어드민이 확인해요',
        body: '어드민이 제출된 결과를 확인하면 ‘확정 전’ 표시가 사라지고 확정돼요. 틀린 곳이 있으면 어드민이 고친 뒤 확인해요.',
      },
      {
        title: '순위와 전적에 반영돼요',
        body: '확정된 결과만 순위·승점·팀 전적·개인 기록에 들어가요. 토너먼트는 확정된 승자가 다음 라운드 대진에 자동으로 반영돼요.',
      },
    ],
    notes: [
      {
        title: '이의 제기 절차는 없어요',
        body: [
          '참가팀이 결과를 입력하거나 이의를 제기하는 절차는 없어요.',
          '결과가 잘못 기록됐다면 대회 운영자나 팀밋에 알려 주세요.',
        ],
      },
      {
        title: '확정 전 점수를 숨기는 대회도 있어요',
        body: ['대회 설정에 따라 확정되기 전의 점수를 보여 주지 않는 대회도 있어요.'],
      },
    ],
    relatedFaqIds: ['result-confirmation', 'result-correction', 'live-score', 'team-record-tabs'],
    updatedAt: U,
  },
];

export function guidePath(slug: GuideSlug): string {
  return `/help/guides/${slug}`;
}

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
