import type {
  TeamMatchCreateStep,
  TeamMatchCreateViewModel,
  TeamMatchDetailViewModel,
  TeamMatchListViewModel,
  TeamMatchStateViewModel,
} from './team-matches.types';

const teamMatches = [
  { id: 'team-match-1', title: 'FC 발빠른놈들 vs 상대팀 구합니다', sport: '축구', hostTeam: 'FC 발빠른놈들', venue: '상암 월드컵 A구장', region: '서울 마포', date: '5월 11일 일', time: '09:00', endTime: '11:00', format: '11:11', grade: 'A', style: '친선', cost: 280000, opponentCost: 140000, uniform: '빨강', gender: '성별 무관', manner: 4.8, wins: 23, status: 'open' as const },
  { id: 'team-match-2', title: '주말 친선 풋살 상대 찾습니다', sport: '풋살', hostTeam: '다이나믹 FS', venue: '신도림 풋살파크', region: '서울 구로', date: '5월 12일 월', time: '20:00', endTime: '22:00', format: '5:5', grade: 'B', style: '매너 중시', cost: 80000, opponentCost: 0, uniform: '파랑', gender: '남', manner: 4.6, wins: 15, status: 'pending' as const },
  { id: 'team-match-3', title: '평일 저녁 6:6 풋살 교환매치', sport: '풋살', hostTeam: '퇴근후풋살', venue: '잠실종합운동장 풋살장', region: '서울 송파', date: '5월 14일 수', time: '19:30', endTime: '21:30', format: '6:6', grade: 'C', style: '교환매치', cost: 60000, opponentCost: 30000, uniform: '검정', gender: '여', manner: 4.7, wins: 11, status: 'approved' as const },
  { id: 'team-match-4', title: '내 팀이 만든 강남 풋살 매치', sport: '풋살', hostTeam: '강남 러너스 FS', venue: '강남 실내풋살장', region: '서울 강남', date: '5월 15일 목', time: '21:00', endTime: '23:00', format: '5:5', grade: 'B', style: '친선', cost: 100000, opponentCost: 50000, uniform: '흰색', gender: '성별 무관', manner: 4.9, wins: 19, status: 'mine' as const },
];

const teamMatchDetailByMode: Record<TeamMatchDetailViewModel['mode'], (typeof teamMatches)[number]> = {
  default: teamMatches[0],
  pending: teamMatches[1],
  approved: teamMatches[2],
  mine: teamMatches[3],
};

const detailCopy: Record<TeamMatchDetailViewModel['mode'], Pick<TeamMatchDetailViewModel['match'], 'description' | 'address' | 'applicantTeams'>> = {
  default: {
    description: '우리 팀 홈구장에서 친선 팀매치를 진행합니다. 상대팀은 신청 후 팀 정보와 등급을 확인해 승인합니다.',
    address: '서울 마포구 월드컵로 240',
    applicantTeams: [
      { name: '성수 러너스 FC', meta: 'B등급 · 매너 4.9 · 18명', status: '신청 가능' },
      { name: '마포 애슬레틱', meta: 'A등급 · 매너 4.7 · 21명', status: '검토 전' },
    ],
  },
  pending: {
    description: '우리 팀 신청이 접수된 팀매치입니다. 홈팀이 팀 정보, 매너, 전적을 확인한 뒤 승인 여부를 결정합니다.',
    address: '서울 구로구 새말로 97',
    applicantTeams: [
      { name: '우리 팀', meta: '신청 완료 · 홈팀 검토 대기', status: '승인 대기' },
      { name: '다이나믹 FS', meta: '홈팀 · 매너 4.6 · 15승', status: '검토 중' },
    ],
  },
  approved: {
    description: '상대팀 승인이 완료된 팀매치입니다. 경기 전 팀 채팅과 준비물 안내를 계속 확인할 수 있습니다.',
    address: '서울 송파구 올림픽로 25',
    applicantTeams: [
      { name: '우리 팀', meta: '승인된 상대팀 · 참가 확정', status: '승인 완료' },
      { name: '퇴근후풋살', meta: '홈팀 · 매너 4.7 · 11승', status: '확정' },
    ],
  },
  mine: {
    description: '내 팀이 만든 팀매치입니다. 신청팀을 승인하거나 거절하고, 필요하면 경기 조건을 수정할 수 있습니다.',
    address: '서울 강남구 테헤란로 120',
    applicantTeams: [
      { name: '서초 풋살클럽', meta: 'B등급 · 매너 4.8 · 16명', status: '승인 대기' },
      { name: '마포 애슬레틱', meta: 'A등급 · 매너 4.7 · 21명', status: '검토 중' },
      { name: '성수 러너스 FC', meta: 'B등급 · 매너 4.9 · 18명', status: '승인 완료' },
    ],
  },
};

const draft = {
  title: '주말 풋살 초보 환영 팀매치',
  description: '상대 팀과 즐겁게 경기하는 친선 팀매치입니다.',
  grade: 'A+',
  format: '5:5',
  style: '친선 · 매너 중시',
  uniform: '빨강 상의 + 검정 하의',
  gender: '성별 무관',
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
    filterCount: 0,
    sports: [
      { label: '전체', count: teamMatches.length, active: true },
      { label: '풋살', count: 12 },
      { label: '축구', count: 8 },
      { label: '러닝', count: 3 },
      { label: '수영', count: 2 },
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
      description: '일시적으로 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      matches: [],
    },
    filter: {
      title: '팀매치 필터',
      description: '상대 팀 조건과 경기 방식을 선택해 신청 가능한 팀매치를 찾아보세요.',
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
  const match = teamMatchDetailByMode[mode];
  return {
    mode,
    match: {
      ...match,
      ...detailCopy[mode],
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
      { name: '강남 러너스', sport: '러닝', members: 12, role: '멤버 · 팀장 또는 관리자만 매치 생성 가능' },
    ],
    sports: ['축구', '풋살', '러닝', '수영'],
    draft,
  };
}
