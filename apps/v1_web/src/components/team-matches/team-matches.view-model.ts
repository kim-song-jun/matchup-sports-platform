import type {
  TeamMatchCreateStep,
  TeamMatchCreateViewModel,
  TeamMatchDetailViewModel,
  TeamMatchListViewModel,
  TeamMatchStateViewModel,
} from './team-matches.types';

const teamMatches = [
  { id: 'team-match-1', title: 'FC 발빠른놈들 vs 상대팀 구합니다', sport: '축구', hostTeam: 'FC 발빠른놈들', venue: '상암 월드컵 A구장', date: '5월 11일 일', time: '09:00', format: '11:11', grade: 'A', cost: 280000, opponentCost: 140000, uniform: '빨강', manner: 4.8, wins: 23, status: 'open' as const },
  { id: 'team-match-2', title: '주말 친선 풋살 상대 찾습니다', sport: '풋살', hostTeam: '다이나믹 FS', venue: '신도림 풋살파크', date: '5월 12일 월', time: '20:00', format: '5:5', grade: 'B', cost: 80000, opponentCost: 0, uniform: '파랑', manner: 4.6, wins: 15, status: 'pending' as const },
  { id: 'team-match-3', title: '평일 저녁 6:6 풋살 교환매치', sport: '풋살', hostTeam: '퇴근후풋살', venue: '잠실종합운동장 풋살장', date: '5월 14일 수', time: '19:30', format: '6:6', grade: 'C', cost: 60000, opponentCost: 30000, uniform: '검정', manner: 4.7, wins: 11, status: 'approved' as const },
];

const draft = {
  title: '주말 풋살 한판!',
  description: '상대팀을 초대해 즐겁게 경기할 팀매치입니다.',
  grade: 'A+',
  format: '5:5',
  style: '친선 · 매너 중시',
  uniform: '빨강 상의 + 검정 하의',
  cost: 200000,
  opponentCost: 0,
  venue: '안양천 풋살장',
  address: '서울 양천구 안양천로 939',
  date: '2026-05-16',
  startTime: '18:00',
  endTime: '20:00',
};

export function getTeamMatchListViewModel(): TeamMatchListViewModel {
  return {
    query: '',
    filterCount: 2,
    sports: [
      { label: '전체', count: teamMatches.length, active: true },
      { label: '풋살', count: 12 },
      { label: '축구', count: 8 },
      { label: '농구', count: 3 },
    ],
    summary: { count: 28, today: 5, urgent: 3 },
    matches: teamMatches,
  };
}

export function getTeamMatchStateViewModel(state: TeamMatchStateViewModel['state']): TeamMatchStateViewModel {
  const base = getTeamMatchListViewModel();
  const copy = {
    empty: {
      title: '조건에 맞는 팀매치가 없어요',
      description: '종목, 지역, 등급 조건을 줄이면 신청 가능한 팀매치를 다시 볼 수 있습니다.',
      matches: [],
    },
    error: {
      title: '팀매치 목록을 불러오지 못했어요',
      description: '네트워크 또는 API 연결 상태를 확인한 뒤 목록으로 돌아가 다시 시도해주세요.',
      matches: [],
    },
    filter: {
      title: '팀매치 필터',
      description: '현재 선택된 팀매치 조건을 확인하는 QA용 fixture입니다. 실제 적용은 목록 API 바인딩 후 연결합니다.',
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
      count: copy.matches.length,
    },
  };
}

export function getTeamMatchDetailViewModel(mode: TeamMatchDetailViewModel['mode'] = 'default'): TeamMatchDetailViewModel {
  return {
    mode,
    match: {
      ...teamMatches[0],
      description: '우리 팀 홈구장에서 친선 팀매치를 진행합니다. 상대팀은 신청 후 팀 정보와 등급을 확인해 승인합니다.',
      address: '서울 마포구 월드컵로 240',
      applicantTeams: [
        { name: '성수 러너스 FC', meta: 'B등급 · 매너 4.9 · 18명', status: '신청대기' },
        { name: '마포 위클리', meta: 'A등급 · 매너 4.7 · 21명', status: '검토중' },
      ],
    },
  };
}

export function getTeamMatchCreateViewModel(step: TeamMatchCreateStep): TeamMatchCreateViewModel {
  return {
    step,
    selectedTeam: '다이나믹 FS',
    selectedSport: '풋살',
    teams: [
      { name: 'FC 발빠른놈들', sport: '축구', members: 24, role: '주장 권한' },
      { name: '다이나믹 FS', sport: '풋살', members: 14, role: '주장 권한', selected: true },
      { name: '강남 바스켓', sport: '농구', members: 12, role: '멤버 · 생성 권한 확인 필요' },
    ],
    sports: ['풋살', '축구', '농구', '배드민턴', '테니스', '러닝'],
    draft,
  };
}
