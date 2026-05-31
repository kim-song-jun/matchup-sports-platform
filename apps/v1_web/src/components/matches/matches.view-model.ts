import type {
  MatchCreateStep,
  MatchCreateViewModel,
  MatchDetailViewModel,
  MatchListViewModel,
  MatchStateViewModel,
} from './matches.types';

const matches = [
  {
    id: 'match-1',
    title: '주말 풋살 초보 환영 매치',
    sport: '풋살',
    venue: '안양천 풋살장',
    region: '목동',
    date: '5월 16일 토',
    time: '18:00',
    current: 8,
    capacity: 10,
    actionLabel: '승인제 신청',
    level: '초보-중수',
    gender: '성별 무관',
    host: '김정민',
    image: '/mock/generated/futsal-rooftop.webp',
    deadline: '마감 18시간 전',
    status: 'open' as const,
  },
  {
    id: 'match-2',
    title: '아침 러닝 5km 함께 뛰어요',
    sport: '러닝',
    venue: '잠실한강공원',
    region: '송파',
    date: '5월 17일 일',
    time: '07:30',
    current: 5,
    capacity: 12,
    actionLabel: '승인 대기',
    level: '중수',
    gender: '남',
    host: '박서준',
    image: '/mock/generated/team-huddle.webp',
    deadline: '호스트 검토중',
    status: 'pending' as const,
  },
  {
    id: 'match-3',
    title: '마포 자유수영 레인 공유',
    sport: '수영',
    venue: '마포 스포츠센터',
    region: '마포',
    date: '5월 18일 월',
    time: '20:00',
    current: 7,
    capacity: 10,
    actionLabel: '승인 완료',
    level: '입문-초보',
    gender: '여',
    host: '이하나',
    image: '/mock/generated/team-huddle.webp',
    deadline: '참가 확정',
    status: 'approved' as const,
  },
  {
    id: 'match-4',
    title: '영암 축구 친선경기',
    sport: '축구',
    venue: '영암월드컵경기장 보조구장',
    region: '목동',
    date: '5월 20일 수',
    time: '21:00',
    current: 20,
    capacity: 20,
    actionLabel: '모집 완료',
    level: '중수-고수',
    gender: '성별 무관',
    host: '윤현우',
    image: '/mock/generated/team-huddle.webp',
    deadline: '모집 완료',
    status: 'full' as const,
  },
  {
    id: 'match-5',
    title: '내가 만든 저녁 농구 픽업',
    sport: '농구',
    venue: '성수 실내체육관',
    region: '성수',
    date: '5월 21일 목',
    time: '19:30',
    current: 6,
    capacity: 10,
    actionLabel: '매치 관리',
    level: '초보-중수',
    gender: '성별 무관',
    host: '나',
    image: '/mock/generated/team-huddle.webp',
    deadline: '신청 3명 검토중',
    status: 'mine' as const,
  },
];

const matchDetailByMode: Record<MatchDetailViewModel['mode'], (typeof matches)[number]> = {
  default: matches[0],
  pending: matches[1],
  approved: matches[2],
  mine: matches[4],
};

const detailCopy: Record<MatchDetailViewModel['mode'], Pick<MatchDetailViewModel['match'], 'description' | 'address' | 'rules' | 'participants'>> = {
  default: {
    description: '초보도 편하게 참여할 수 있는 주말 풋살 매치입니다. 경기 전 10분 일찍 모여 팀을 나누고 가볍게 몸을 풉니다.',
    address: '서울 양천구 안양천로 939',
    rules: ['풋살화 착용', '개인 물 지참', '지각 시 호스트에게 미리 연락'],
    participants: [
      { name: '김정민', meta: '호스트 · 매너 4.9', status: '승인완료' },
      { name: '박서준', meta: '초보 · 최근 3경기', status: '승인완료' },
      { name: '이하나', meta: '중수 · 빠른 응답', status: '승인중' },
    ],
  },
  pending: {
    description: '참가 신청이 접수된 러닝 매치입니다. 호스트가 프로필과 최근 참여 이력을 확인한 뒤 승인 여부를 결정합니다.',
    address: '서울 송파구 올림픽로 25',
    rules: ['러닝화 착용', '개인 물 지참', '승인 전까지 참가 확정 아님'],
    participants: [
      { name: '박서준', meta: '호스트 · 매너 4.8', status: '승인완료' },
      { name: '나', meta: '신청자 · 승인 대기', status: '승인중' },
    ],
  },
  approved: {
    description: '승인이 완료된 수영 매치입니다. 참가가 확정되었으므로 경기 전 안내와 준비물을 계속 확인할 수 있습니다.',
    address: '서울 마포구 월드컵로 25',
    rules: ['수모 착용', '입장 15분 전 도착', '승인 완료자는 채팅 안내 확인'],
    participants: [
      { name: '이하나', meta: '호스트 · 매너 4.9', status: '승인완료' },
      { name: '나', meta: '참가 확정', status: '승인완료' },
    ],
  },
  mine: {
    description: '내가 만든 농구 픽업 매치입니다. 신청자를 승인하거나 거절하고, 필요하면 매치 정보를 수정할 수 있습니다.',
    address: '서울 성동구 아차산로 17',
    rules: ['실내화 착용', '팀 조끼 제공', '신청자는 호스트 승인 후 확정'],
    participants: [
      { name: '정하늘', meta: '신청 메시지 · 2명 동반 가능', status: '승인 대기' },
      { name: '문태오', meta: '최근 농구 5경기 · 매너 4.7', status: '승인 대기' },
      { name: '최유진', meta: '참가 확정', status: '승인완료' },
    ],
  },
};

const draft = {
  title: '',
  description: '',
  image: '/mock/generated/futsal-rooftop.webp',
  capacity: 10,
  actionLabel: '승인제 신청',
  minLevel: '입문',
  maxLevel: '고수',
  gender: '성별 무관',
  rules: '',
  venue: '',
  address: '',
  date: '',
  startTime: '',
  endTime: '',
};

export function getMatchListViewModel(): MatchListViewModel {
  return {
    query: '',
    filterCount: 0,
    sports: [
      { label: '전체', count: matches.length, active: true },
      { label: '풋살', count: 8 },
      { label: '축구', count: 6 },
      { label: '러닝', count: 4 },
      { label: '수영', count: 5 },
    ],
    summary: {
      label: '서울 전체 · 개인 매치',
      count: 34,
      today: 7,
      urgent: 4,
    },
    matches,
  };
}

export function getMatchStateViewModel(state: MatchStateViewModel['state']): MatchStateViewModel {
  const base = getMatchListViewModel();
  const copy = {
    empty: {
      title: '조건에 맞는 매치가 없어요',
      description: '지역, 시간, 종목 조건을 줄이면 참여 가능한 매치를 다시 볼 수 있습니다.',
      matches: [],
    },
    error: {
      title: '매치 목록을 불러오지 못했어요',
      description: '일시적으로 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
      matches: [],
    },
    filter: {
      title: '필터',
      description: '원하는 종목, 지역, 모집 상태를 선택해 참여 가능한 매치를 찾아보세요.',
      matches: base.matches,
    },
    joined: {
      title: '참여한 매치',
      description: '신청 대기와 승인 완료 상태의 개인 매치를 모아 보여줍니다.',
      matches: base.matches.filter((match) => match.status === 'pending' || match.status === 'approved'),
    },
    participants: {
      title: '참가자',
      description: '참가 신청과 승인 상태를 확인할 수 있습니다.',
      matches: base.matches,
    },
  }[state];

  return {
    ...base,
    state,
    title: copy.title,
    description: copy.description,
    matches: copy.matches,
    summary: {
      ...base.summary,
      label: copy.title,
      count: copy.matches.length,
    },
  };
}

export function getMatchDetailViewModel(mode: MatchDetailViewModel['mode'] = 'default'): MatchDetailViewModel {
  const match = matchDetailByMode[mode];
  return {
    mode,
    match: {
      ...match,
      ...detailCopy[mode],
    },
  };
}

export function getMatchCreateViewModel(step: MatchCreateStep): MatchCreateViewModel {
  return {
    step,
    selectedSport: '풋살',
    sports: ['축구', '풋살', '러닝', '수영'],
    levels: ['입문', '초보', '중수', '고수'],
    draft,
  };
}
