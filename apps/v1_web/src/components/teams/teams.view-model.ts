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
    capacity: 24,
    status: 'open' as const,
    statusLabel: '모집 중',
    tags: ['초보-중수', '주 1회', '친선'],
    genderRule: '성별 무관',
    intro: '주 1회 정기적으로 풋살을 즐기는 동네 팀이에요. 초보-중수 멤버와 빠른 응답을 중요하게 봐요.',
    next: '오늘 21:00 정기전',
  },
  {
    id: 'team-2',
    name: '강동 애슬레틱 풋살',
    logo: '강',
    sport: '풋살',
    sports: ['풋살'],
    region: '서울 강동',
    members: 22,
    capacity: 28,
    status: 'reviewing' as const,
    statusLabel: '검토 중',
    tags: ['중수', '평일 저녁', '리그 준비'],
    genderRule: '여',
    intro: '평일 저녁 풋살 위주로 운영하는 팀이에요. 가입 신청은 운영진 검토 후 확정해요.',
    next: '가입 신청 검토 중',
  },
  {
    id: 'team-3',
    name: '마포 원데이 FC',
    logo: '마',
    sport: '축구',
    sports: ['축구', '풋살'],
    region: '서울 마포',
    members: 26,
    capacity: 26,
    status: 'closed' as const,
    statusLabel: '마감',
    tags: ['11:11', '주말', 'A등급'],
    genderRule: '남',
    intro: '주말 11:11 경기를 꾸준히 하는 팀이에요. 현재 모집은 닫혀 있어 다음 모집 알림만 받을 수 있어요.',
    next: '다음 모집 알림 가능',
  },
  {
    id: 'team-4',
    name: '내 팀 다이나믹 FS',
    logo: '다',
    sport: '풋살',
    sports: ['풋살', '러닝'],
    region: '서울 구로',
    members: 14,
    capacity: 20,
    status: 'mine' as const,
    statusLabel: '내 팀',
    tags: ['팀장', '팀매치 운영 중', '친선'],
    genderRule: '성별 무관',
    intro: '내가 관리하는 풋살 팀이에요. 팀 소개, 멤버 권한, 모집 상태와 팀매치 생성을 관리할 수 있어요.',
    next: '신청 3명 검토 필요',
  },
];

const teamByMode: Record<TeamDetailViewModel['mode'], (typeof teams)[number]> = {
  default: teams[0],
  pending: teams[1],
  closed: teams[2],
  mine: teams[3],
};

const detailByMode: Record<TeamDetailViewModel['mode'], Pick<TeamDetailViewModel['team'], 'description' | 'activity' | 'condition' | 'schedule' | 'city' | 'county' | 'level' | 'membersList'>> = {
  default: {
    description: '성수와 광진권에서 풋살 정기전을 운영하는 팀이에요. 신규 멤버는 2주 체험 후 정식 가입으로 전환해요.',
    activity: '주 1회 정기전 · 신규 멤버 3명 모집',
    condition: '풋살 초보-중수 · 성동/광진권 활동 가능',
    schedule: '매주 목 21:00 · 성수 풋살파크',
    city: '서울',
    county: '성동구',
    level: '초보-중수',
    membersList: [
      { name: '김도윤', role: '팀장', meta: 'FW', status: '관리자', visibility: '공개' },
      { name: '박서준', role: '운영진', meta: 'GK', status: '관리자', visibility: '공개' },
      { name: '이하나', role: '멤버', meta: '최근 4경기', status: '활동중', visibility: '비공개' },
    ],
  },
  pending: {
    description: '가입 신청이 접수된 팀이에요. 운영진이 프로필, 활동 지역, 최근 매치 이력을 검토하고 있어요.',
    activity: '평일 저녁 정기전 · 운영진 검토 후 가입',
    condition: '풋살 중수 · 평일 저녁 참여 가능',
    schedule: '매주 화 20:00 · 강동 풋살파크',
    city: '서울',
    county: '강동구',
    level: '중수',
    membersList: [
      { name: '운영진', role: '관리자', meta: '가입 신청 검토 중', status: '검토 중', visibility: '공개' },
      { name: '나', role: '신청자', meta: '가입 승인 대기', status: '검토중', visibility: '비공개' },
    ],
  },
  closed: {
    description: '현재 모집이 마감된 축구 팀이에요. 다음 모집이 열리면 알림을 받을 수 있어요.',
    activity: '주말 11:11 정기전 · 현재 모집 마감',
    condition: '축구 A등급 · 주말 고정 참여',
    schedule: '매주 일 09:00 · 상암 보조구장',
    city: '서울',
    county: '마포구',
    level: '중수-고수',
    membersList: [
      { name: '모집 상태', role: '마감', meta: '다음 모집 알림 가능', status: '마감', visibility: '비공개' },
    ],
  },
  mine: {
    description: '내가 관리하는 팀이에요. 팀 정보, 멤버 권한, 가입 신청, 팀매치 생성과 수정 흐름으로 이동할 수 있어요.',
    activity: '팀매치 운영 중 · 가입 신청 3명 검토 필요',
    condition: '풋살 초보-중수 · 구로/영등포권',
    schedule: '매주 금 21:00 · 신도림 풋살파크',
    city: '서울',
    county: '구로구',
    level: '초보-중수',
    membersList: [
      { name: '나', role: '팀장', meta: '모든 권한', status: '팀장', visibility: '공개' },
      { name: '정하늘', role: '운영진', meta: '가입 승인 가능', status: '관리자', visibility: '공개' },
      { name: '문태오', role: '멤버', meta: '최근 3경기', status: '활동중', visibility: '비공개' },
    ],
  },
};

export function getTeamListViewModel(): TeamListViewModel {
  return {
    query: '',
    placeholder: '팀명, 지역, 종목 검색',
    filterCount: 0,
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
      description: '팀명, 지역, 종목으로 가입 가능한 팀을 찾아보세요.',
      query: '풋살',
      teams,
    },
    empty: {
      title: '조건에 맞는 팀이 없어요',
      description: '지역, 종목, 모집 상태 조건을 줄이면 가입 가능한 팀을 다시 볼 수 있어요.',
      query: '없는 팀',
      teams: [],
    },
    error: {
      title: '팀 목록을 불러오지 못했어요',
      description: '목록을 일시적으로 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      query: '풋살',
      teams: [],
    },
    restricted: {
      title: '멤버 목록이 비공개예요',
      description: '이 팀은 운영진이 멤버 목록을 비공개로 설정했어요. 팀 운영진만 멤버 목록을 볼 수 있어요.',
      query: '',
      teams: [],
    },
    filter: {
      title: '팀 필터',
      description: '지역, 종목, 모집 상태를 선택해 나에게 맞는 팀을 찾아보세요.',
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
      nearby: state === 'empty' || state === 'error' || state === 'restricted' ? 0 : base.summary.nearby,
    },
  };
}

export function getTeamDetailViewModel(mode: TeamDetailViewModel['mode'] = 'default'): TeamDetailViewModel {
  const team = teamByMode[mode];
  return {
    mode,
    ctaLabel: mode === 'mine' ? '팀 관리' : mode === 'pending' ? '신청 상태 보기' : mode === 'closed' ? '모집 알림 받기' : '가입 신청',
    team: {
      ...team,
      ...detailByMode[mode],
      memberAccess: {
        canView: mode === 'mine',
        enabled: mode === 'mine',
        message: mode === 'mine'
          ? '멤버 목록을 볼 수 있어요.'
          : '팀 멤버만 멤버 목록을 볼 수 있어요.',
      },
    },
  };
}

export function getTeamFormViewModel(mode: TeamFormViewModel['mode']): TeamFormViewModel {
  return {
    mode,
    team: {
      name: mode === 'edit' ? '성수 러너스 FC' : '',
      logoUrl: null,
      sport: '풋살',
      region: '서울 성동구',
      description: mode === 'edit' ? '주 1회 꾸준히 함께 경기할 멤버를 찾아요.' : '',
      sports: mode === 'edit' ? ['풋살', '축구'] : [],
      city: mode === 'edit' ? '서울' : '',
      county: mode === 'edit' ? '성동구' : '',
      level: mode === 'edit' ? '초보-중수' : '전체 레벨',
      genderRule: '성별 무관',
      activity: mode === 'edit' ? '평일 저녁 · 주 1회' : '',
      capacity: 24,
    },
  };
}

export function getTeamMembersViewModel(): TeamMembersViewModel {
  return {
    teamName: '성수 러너스 FC',
    activeTab: 'members',
    tabs: [
      { key: 'members', label: '멤버', count: 3, onSelect: () => undefined },
      { key: 'requests', label: '가입 요청', count: 2, onSelect: () => undefined },
    ],
    summary: { total: 18, managers: 2, pending: 3 },
    members: [
      { name: '김도윤', role: '팀장', meta: 'FW · 가입 2024.03', locked: true, actions: [] },
      { name: '박서준', role: '운영진', meta: 'GK · 가입 2024.05', actions: [] },
      { name: '이하나', role: '멤버', meta: 'MF · 최근 4경기', actions: [] },
    ],
    requests: [
      { name: '정하늘', meta: '초보-중수 · 성동 · 풋살 2년', status: '검토 중', actions: [] },
      { name: '최유진', meta: '초보 · 광진 · 평일 가능', status: '검토 중', actions: [] },
    ],
  };
}
