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
    title: '주말 풋살 한판!',
    sport: '풋살',
    venue: '안양천 풋살장',
    region: '양천',
    date: '5월 16일 토',
    time: '18:00',
    current: 8,
    capacity: 10,
    actionLabel: '승인제 신청',
    level: '초보-중수',
    host: '김정민',
    image: '/mock/generated/futsal-rooftop.webp',
    deadline: '마감 18시간 전',
    status: 'open' as const,
  },
  {
    id: 'match-2',
    title: '잠실 아침 러닝',
    sport: '러닝',
    venue: '잠실한강공원',
    region: '강남',
    date: '5월 17일 일',
    time: '07:30',
    current: 5,
    capacity: 12,
    actionLabel: '승인 대기',
    level: '중수',
    host: '박서준',
    image: '/mock/generated/team-huddle.webp',
    deadline: '마감 임박',
    status: 'pending' as const,
  },
  {
    id: 'match-3',
    title: '마포 자유수영 레인',
    sport: '수영',
    venue: '마포 스포츠센터',
    region: '마포',
    date: '5월 18일 월',
    time: '20:00',
    current: 7,
    capacity: 10,
    actionLabel: '승인 완료',
    level: '입문-초보',
    host: '이하나',
    image: '/mock/generated/team-huddle.webp',
    deadline: '2일 남음',
    status: 'approved' as const,
  },
  {
    id: 'match-4',
    title: '상암 축구 친선경기',
    sport: '축구',
    venue: '상암월드컵경기장 보조구장',
    region: '목동',
    date: '5월 20일 수',
    time: '21:00',
    current: 20,
    capacity: 20,
    actionLabel: '모집 완료',
    level: '중수-고수',
    host: '오현우',
    image: '/mock/generated/team-huddle.webp',
    deadline: '모집 완료',
    status: 'full' as const,
  },
];

const draft = {
  title: '주말 풋살 한판!',
  description: '초보도 편하게 참여할 수 있는 주말 풋살 매치입니다.',
  image: '/mock/generated/futsal-rooftop.webp',
  capacity: 10,
  actionLabel: '승인제 신청',
  minLevel: '초보',
  maxLevel: '중수',
  gender: '무관',
  rules: '풋살화 착용, 지각 시 미리 연락',
  venue: '안양천 풋살장',
  address: '서울 양천구 안양천로 939',
  date: '2026-05-16',
  startTime: '18:00',
  endTime: '20:00',
};

export function getMatchListViewModel(): MatchListViewModel {
  return {
    query: '',
    filterCount: 2,
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
      description: '네트워크 또는 API 연결 상태를 확인한 뒤 목록으로 돌아가 다시 시도해주세요.',
      matches: [],
    },
    filter: {
      title: '필터',
      description: '현재 선택된 조건을 확인하는 QA용 fixture입니다. 실제 적용은 목록 API 바인딩 후 연결합니다.',
      matches: base.matches,
    },
    joined: {
      title: '참여한 매치',
      description: '신청 대기와 승인 완료 상태의 개인 매치를 모아 보여줍니다.',
      matches: base.matches.filter((match) => match.status === 'pending' || match.status === 'approved'),
    },
    participants: {
      title: '참가자',
      description: '매치 상세의 참가자 목록을 독립 route에서 확인하는 QA용 fixture입니다.',
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
  const match = matches[0];
  return {
    mode,
    match: {
      ...match,
      description: '초보도 편하게 참여할 수 있는 주말 풋살 매치입니다. 경기 전 10분 일찍 모여 팀을 나누고 가볍게 워밍업합니다.',
      address: '서울 양천구 안양천로 939',
      rules: ['풋살화 착용', '개인 물 지참', '지각 시 미리 연락'],
      participants: [
        { name: '김정민', meta: '호스트 · 매너 4.9', status: '승인완료' },
        { name: '박서준', meta: '초보 · 최근 3경기', status: '승인완료' },
        { name: '이하나', meta: '중수 · 빠른 응답', status: '승인중' },
      ],
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
