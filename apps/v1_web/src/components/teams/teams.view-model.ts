import type {
  TeamDetailViewModel,
  TeamFormViewModel,
  TeamListViewModel,
  TeamMembersViewModel,
  TeamStateViewModel,
} from './teams.types';

const teams = [
  {
    id: 'team-1',
    name: '성수 러너스 FC',
    logo: '성',
    sport: '풋살',
    sports: ['풋살', '축구'],
    region: '서울 성동',
    members: 18,
    status: 'open' as const,
    statusLabel: '모집중',
    tags: ['초보-중수', '주 1회', '친선'],
    intro: '주 1회 정기적으로 풋살을 즐기는 동네 팀입니다. 초보-중수 멤버와 빠른 응답을 중요하게 봅니다.',
    fit: 94,
    manner: 4.9,
    trust: 'verified' as const,
    next: '오늘 21:00 정기전',
  },
  {
    id: 'team-2',
    name: '강동 위클리 풋살',
    logo: '강',
    sport: '풋살',
    sports: ['풋살'],
    region: '서울 강동',
    members: 22,
    status: 'reviewing' as const,
    statusLabel: '검토중',
    tags: ['중수', '평일 저녁', '리그 준비'],
    intro: '평일 저녁 풋살 위주로 운영하는 팀입니다. 가입 신청은 운영진 검토 후 확정됩니다.',
    fit: 88,
    manner: 4.7,
    trust: 'estimated' as const,
    next: '가입 신청 검토 중',
  },
  {
    id: 'team-3',
    name: '마포 선데이 FC',
    logo: '마',
    sport: '축구',
    sports: ['축구', '풋살'],
    region: '서울 마포',
    members: 26,
    status: 'closed' as const,
    statusLabel: '마감',
    tags: ['11:11', '주말', 'A등급'],
    intro: '주말 11:11 경기를 꾸준히 하는 팀입니다. 현재 모집은 닫혀 있어 다음 모집 알림만 받을 수 있습니다.',
    fit: 76,
    manner: 4.6,
    trust: 'sample' as const,
    next: '다음 모집 알림 가능',
  },
];

export function getTeamListViewModel(): TeamListViewModel {
  return {
    query: '',
    placeholder: '팀명, 지역, 종목 검색',
    filterCount: 3,
    chips: ['전체 42', '모집중 18', '내 주변', '초보-중수', '주 1회'].map((label, index) => ({ label, active: index === 0 })),
    summary: { scope: '서울 전체 · 팀 둘러보기', total: 42, recruiting: 18, nearby: 7 },
    teams,
  };
}

export function getTeamStateViewModel(state: TeamStateViewModel['state']): TeamStateViewModel {
  const base = getTeamListViewModel();
  const copy = {
    search: {
      title: '팀 검색',
      description: '검색어가 입력된 팀 둘러보기 상태를 확인하는 QA용 fixture입니다.',
      query: '풋살',
      teams,
    },
    empty: {
      title: '조건에 맞는 팀이 없어요',
      description: '지역, 종목, 모집 상태 조건을 줄이면 가입 가능한 팀을 다시 볼 수 있습니다.',
      query: '없는 팀',
      teams: [],
    },
    error: {
      title: '팀 목록을 불러오지 못했어요',
      description: '네트워크 또는 API 연결 상태를 확인한 뒤 목록으로 돌아가 다시 시도해주세요.',
      query: '풋살',
      teams: [],
    },
    filter: {
      title: '팀 필터',
      description: '현재 선택된 팀 조건을 확인하는 QA용 fixture입니다. 실제 적용은 목록 API 바인딩 후 연결합니다.',
      query: '',
      teams,
    },
  }[state];

  return {
    ...base,
    state,
    title: copy.title,
    description: copy.description,
    query: copy.query,
    teams: copy.teams,
    summary: {
      ...base.summary,
      total: copy.teams.length,
      recruiting: copy.teams.filter((team) => team.status === 'open').length,
      nearby: state === 'empty' || state === 'error' ? 0 : base.summary.nearby,
    },
  };
}

export function getTeamDetailViewModel(mode: TeamDetailViewModel['mode'] = 'default'): TeamDetailViewModel {
  return {
    mode,
    team: {
      ...teams[0],
      description: '성수와 광진권에서 풋살 정기전을 운영하는 팀입니다. 신규 멤버는 2주 체험 후 정식 가입으로 전환합니다.',
      activity: '주 1회 정기전 · 신규 멤버 3명 모집',
      condition: '풋살 초보-중수 · 성동/광진권 활동 가능',
      trustNote: 'verified · 최근 경기 12회 · 신고 0건',
      schedule: '매주 화 21:00 · 성수 풋살파크',
      city: '서울',
      county: '성동구',
      level: '초보-중수',
      contact: '비공개',
      links: [
        { label: 'Instagram', value: 'https://instagram.com/seongsu-runners' },
        { label: 'Kakao', value: 'https://open.kakao.com/seongsu-runners' },
        { label: 'Website', value: '등록된 링크 없음' },
      ],
      images: [
        { title: '로고 이미지', count: 1 },
        { title: '커버 이미지', count: 1 },
        { title: '추가 사진', count: 3, max: 10 },
        { title: '예시 이미지', count: 2, example: true },
      ],
      membersList: [
        { name: '김도윤', role: '팀장', meta: 'FW · 매너 4.9', status: '관리자' },
        { name: '박서준', role: '운영진', meta: 'GK · 매너 4.8', status: '관리자' },
        { name: '이하늘', role: '멤버', meta: 'MF · 최근 4경기', status: '활동중' },
      ],
    },
  };
}

export function getTeamFormViewModel(mode: TeamFormViewModel['mode']): TeamFormViewModel {
  return {
    mode,
    team: {
      name: mode === 'edit' ? '성수 러너스 FC' : '새 풋살 팀',
      sport: '풋살',
      region: '서울 성동구',
      description: '주 1회 꾸준히 함께 경기할 멤버를 찾습니다.',
      sports: ['풋살', '축구'],
      city: '서울',
      county: '성동구',
      level: '초보-중수',
      activity: '평일 저녁 · 주 1회',
      capacity: 24,
      contact: '비공개',
      links: [
        { label: 'Instagram', value: 'https://instagram.com/seongsu-runners' },
        { label: 'Kakao', value: 'https://open.kakao.com/seongsu-runners' },
      ],
    },
  };
}

export function getTeamMembersViewModel(): TeamMembersViewModel {
  return {
    teamName: '성수 러너스 FC',
    summary: { total: 18, managers: 2, pending: 3 },
    members: [
      { name: '김도윤', role: '팀장', meta: 'FW · 가입 2024.03', status: '팀장', locked: true },
      { name: '박서준', role: '운영진', meta: 'GK · 가입 2024.05', status: '관리자' },
      { name: '이하늘', role: '멤버', meta: 'MF · 최근 4경기', status: '활동중' },
    ],
    requests: [
      { name: '정민호', meta: '초보-중수 · 성동 · 풋살 2년', status: '검토중' },
      { name: '최유진', meta: '초보 · 광진 · 평일 가능', status: '검토중' },
    ],
  };
}
